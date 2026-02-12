import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import logo from "./bajajlogo.png";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

// Since frontend & backend are in same Databricks app
const BACKEND_URL = "";

function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Format numbers with commas
  const formatValue = (value) => {
    if (typeof value === "number") {
      return value.toLocaleString();
    }

    if (!isNaN(value) && value !== null && value !== "") {
      return Number(value).toLocaleString();
    }

    return value;
  };

  const sendMessage = async () => {
    if (!prompt.trim()) return;

    const userMessage = {
      role: "user",
      content: prompt,
    };

    setMessages((prev) => [...prev, userMessage]);

    setPrompt(""); // ✅ Clear immediately
    setLoading(true);

    try {
      let response;

      if (!conversationId) {
        response = await axios.post(`/start`, { prompt });
        setConversationId(response.data.conversation_id);
      } else {
        response = await axios.post(`/followup`, {
          conversation_id: conversationId,
          prompt,
        });
      }

      console.log("GENIE RESPONSE:", response.data);

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

        // Optional chart support if backend sends chart type
        if (res.type === "chart") {
          formatted.push({
            role: "assistant",
            type: "chart",
            data: res.data,
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

    // Chart rendering
    if (msg.type === "chart" && msg.data?.length > 0) {
      const keys = Object.keys(msg.data[0]);

      return (
        <div key={index} className="assistant bubble">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={msg.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={keys[0]} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={keys[1]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // Table rendering
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
                        <td
                          key={j}
                          style={{
                            textAlign:
                              typeof val === "number" || !isNaN(val)
                                ? "right"
                                : "left",
                          }}
                        >
                          {formatValue(val)}
                        </td>
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

        <div ref={messagesEndRef} />
      </div>

      <div className="input-box">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Jarvis something magical..."
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />

        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default App;
