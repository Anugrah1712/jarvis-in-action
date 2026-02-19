import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import logo from "./bajajlogo.png";

// =======================
// COMMON HELPERS
// =======================

const isNumeric = (v) => !isNaN(v) && v !== null && v !== "";
const isDate = (v) => typeof v === "string" && !isNaN(Date.parse(v));

const formatValue = (value) => {
  if (isNumeric(value)) return Number(value).toLocaleString();

  if (isDate(value)) {
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
    });
  }

  return value;
};

// =======================
// API WRAPPER
// =======================

const callGenieAPI = async ({
  conversationId,
  prompt,
  business,
  setConversationId,
}) => {
  const endpoint = conversationId ? "/followup" : "/start";

  const body = conversationId
    ? { conversation_id: conversationId, prompt, business }
    : { prompt, business };

  const res = await axios.post(endpoint, body, { timeout: 600000 });

  if (!conversationId) {
    setConversationId(res.data.conversation_id);
  }

  return res.data.response;
};

// =======================
// RESPONSE FORMATTER
// =======================

const formatGenieResponse = (responses) =>
  responses
    .map((res) => {
      if (res.type === "text") {
        const isSuggestion =
          res.content.trim().endsWith("?") &&
          /(would you|prefer|want to|like to)/i.test(res.content);

        return {
          role: "assistant",
          type: isSuggestion ? "suggestion" : "text",
          content: res.content,
        };
      }

      if (res.type === "query") {
        return {
          role: "assistant",
          type: "table",
          ...res,
        };
      }

      return null;
    })
    .filter(Boolean);

    const DataTable = ({ msg }) => {
  if (!msg.data?.length) return null;

  const keys = Object.keys(msg.data[0]);

  return (
    <>
      {msg.description && (
        <div className="query-title">{msg.description}</div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              {keys.map((col) => (
                <th
                  key={col}
                  className={isNumeric(msg.data[0][col]) ? "numeric-column" : ""}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {msg.data.slice(0, 100).map((row, i) => (
              <tr key={i}>
                {keys.map((key) => (
                  <td
                    key={key}
                    className={isNumeric(row[key]) ? "numeric-column" : ""}
                  >
                    {formatValue(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");

  const messagesEndRef = useRef(null);
  const handleBusinessChange = (e) => {
    setSelectedBusiness(e.target.value);
    setConversationId(null);
    setMessages([]);
  };

  useEffect(() => {
    const loadBusinesses = async () => {
      try {
        const res = await axios.get("/api/businesses");
        setBusinesses(res.data);
        if (res.data.length > 0) {
          setSelectedBusiness(res.data[0].id);
        }
      } catch (err) {
        console.error("Failed to load businesses", err);
      }
    };

    loadBusinesses();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = async (customText = null) => {
  if (loading) return;

  const text = customText ?? prompt;
  if (!text.trim()) return;

  setMessages((prev) => [...prev, { role: "user", content: text }]);
  if (!customText) setPrompt("");
  setLoading(true);

  try {
    const genieResponses = await callGenieAPI({
      conversationId,
      prompt: text,
      business: selectedBusiness,
      setConversationId,
    });

    const formatted = formatGenieResponse(genieResponses);
    setMessages((prev) => [...prev, ...formatted]);
  } catch (error) {
    const message =
      error.code === "ECONNABORTED"
        ? "⏳ Genie is processing a complex query."
        : "⚠️ Unable to reach Genie backend.";

    setMessages((prev) => [
      ...prev,
      { role: "assistant", type: "text", content: message },
    ]);
  }

  setLoading(false);
};

  const renderMessage = (msg, index) => {
  if (msg.role === "user")
    return <div key={index} className="user bubble">{msg.content}</div>;

  if (msg.type === "text")
    return <div key={index} className="assistant bubble">{msg.content}</div>;

  if (msg.type === "suggestion")
    return (
      <div key={index} className="assistant bubble">
        <div
          className="suggestion-chip"
          onClick={() => sendMessage(msg.content)}
        >
          {msg.content}
        </div>
      </div>
    );

  if (msg.type === "table")
    return (
      <div key={index} className="assistant bubble">
        <DataTable msg={msg} />
      </div>
    );

  return null;
};

  return (
    <div className="app-container">
      <header className="header">
        <img src={logo} className="logo-right" alt="logo" />
        <h1 className="title">JARVIS</h1>
            <select
              className="business-dropdown"
              value={selectedBusiness}
              onChange={handleBusinessChange}
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

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
