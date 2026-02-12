import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import logo from "./bajajlogo.png";

// Since frontend & backend are in same app now
// we don't need full URL anymore
const BACKEND_URL = "";

function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Auto scroll reference
  const messagesEndRef = useRef(null);

  // Auto scroll effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    if (!prompt.trim()) return;

    const userMessage = {
      role: "user",
      content: prompt,
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      let response;

      if (!conversationId) {
        response = await axios.post(`/start`, {
          prompt: prompt,
        });

        setConversationId(response.data.conversation_id);
      } else {
        response = await axios.post(`/followup`, {
          conversation_id: conversationId,
          prompt: prompt,
        });
      }

      const genieResponses = response.data.response;

      let formatted = [];

      genieResponses.forEach((res) => {
        if (res.type === "text") {
          formatted.push({
            role: "assistant",
            type: "text",
            content: res.content,
          });
        }

        if (res.type === "query") {
          formatted.push({
            role: "assistant",
            type: "table",
            description: res.description,
            data: res.data,
            generated_code: res.generated_code,
          });
        }
      });

      setMessages((prev) => [...prev, ...formatted]);
    } catch (error) {
      console.error("API Error:", error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          type: "text",
          content:
            "⚠️ Sorry, Jarvis is having trouble connecting to Genie Backend.",
        },
      ]);
    }

    setPrompt("");
    setLoading(false);
  };

  const renderMessage = (msg, index) => {
    if (msg.role === "user") {
      return (
        <div key={index} className="user bubble">
          {msg.content}
        </div>
      );
    }

    if (msg.type === "text") {
      return (
        <div key={index} className="assistant bubble">
          {msg.content}
        </div>
      );
    }

    if (msg.type === "table") {
      return (
        <div key={index} className="assistant bubble">
          {msg.description && (
            <div className="query-title">{msg.description}</div>
          )}

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {msg.data &&
                    msg.data.length > 0 &&
                    Object.keys(msg.data[0]).map((col, i) => (
                      <th key={i}>{col}</th>
                    ))}
                </tr>
              </thead>

              <tbody>
                {msg.data &&
                  msg.data.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td key={j}>{val}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {msg.generated_code && (
            <details className="sql-box">
              <summary>View Generated SQL</summary>
              <pre>{msg.generated_code}</pre>
            </details>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="app-container">
      <header className="header">
        <img src={logo} className="logo-left" alt="logo" />

        <h1 className="title">JARVIS</h1>

        <div className="tagline">
          Enterprise Data Assistant powered by Databricks Genie
        </div>
      </header>

      <div className="chat-area">
        {messages.length === 0 && (
          <div className="welcome">
            Hello! Jarvis this side 👋🏻
            <br />
            How can I assist you today?
          </div>
        )}

        {messages.map((msg, index) => renderMessage(msg, index))}

        {loading && (
          <div className="assistant bubble typing">
            Jarvis is thinking...
          </div>
        )}

        {/* Auto-scroll target */}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-box">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Jarvis something magical..."
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        />

        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default App;