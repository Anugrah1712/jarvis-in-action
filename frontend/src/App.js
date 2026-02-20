import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import logo from "./bajajlogo.png";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

const callGenieAPI = async ({ conversationId, prompt, business, setConversationId }) => {
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
    .map((res, idx) => {
      console.log("Raw Genie response", idx, res); // <-- log every response

      // Text response
      if (res.type === "text") {
        const isSuggestion =
          res.content.trim().endsWith("?") &&
          /(would you|prefer|want to|like to)/i.test(res.content);

        // Check if it looks like a markdown table
        const tableMatch = res.content.match(/\|(.+)\|/);
        if (tableMatch) {
          console.log("Detected markdown table in text", res.content);
          const rows = res.content
            .trim()
            .split("\n")
            .filter((r) => r.includes("|"))
            .map((r) =>
              r
                .split("|")
                .map((c) => c.trim())
                .filter(Boolean)
            );

          if (rows.length > 1) {
            const headers = rows[0];
            const data = rows.slice(1).map((row) =>
              headers.reduce((acc, h, i) => {
                acc[h] = row[i] ?? "";
                return acc;
              }, {})
            );

            console.log("Parsed table data", data);

            return {
              role: "assistant",
              type: "table",
              data,
              description: "Genie Table (from markdown)",
            };
          }
        }

        return {
          role: "assistant",
          type: isSuggestion ? "suggestion" : "text",
          content: res.content,
        };
      }

      // Structured table (query)
      if (res.type === "query") {
        console.log("Detected query/table response", res);
        return {
          role: "assistant",
          type: "table",
          ...res,
        };
      }

      // Charts
      if (res.type === "chart") {
        console.log("Detected chart response", res);
        return {
          role: "assistant",
          type: "chart",
          chartType: res.chartType, // bar, line, pie
          data: res.data,
          xKey: res.xKey,
          yKey: res.yKey,
          description: res.description,
        };
      }

      // SQL queries
      if (res.type === "sql") {
        console.log("Detected SQL response", res.query);
        return {
          role: "assistant",
          type: "sql",
          query: res.query,
        };
      }

      console.log("Unknown response type", res.type);
      return null;
    })
    .filter(Boolean);

// =======================
// COMPONENTS
// =======================

const DataTable = ({ msg }) => {
  if (!msg.data?.length) return null;

  const keys = Object.keys(msg.data[0]);

  const downloadCSV = () => {
    const header = keys.join(",");
    const rows = msg.data.slice(0, 100).map((row) =>
      keys.map((k) => `"${row[k]}"`).join(",")
    );
    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "table_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      {msg.description && <div className="query-title">{msg.description}</div>}

      <button
        onClick={downloadCSV}
        style={{
          margin: "10px 0",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
          background: "#38bdf8",
          color: "#0f172a",
          fontWeight: 600,
        }}
      >
        Download CSV
      </button>

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

const ChartRenderer = ({ msg }) => {
  if (!msg.data || !msg.data.length) return null;

  // Chart container style
  const containerStyle = {
    width: "100%",
    height: "400px", // slightly bigger for visibility
    marginTop: "20px",
    padding: "10px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.03)",
    overflow: "visible",
  };

  const chartProps = {
    data: msg.data,
    margin: { top: 20, right: 30, left: 0, bottom: 20 },
  };

  return (
    <div className="chart-container" style={containerStyle}>
      {msg.description && <div className="query-title">{msg.description}</div>}

      <ResponsiveContainer width="100%" height="100%">
        {msg.chartType === "bar" && (
          <BarChart {...chartProps}>
            <XAxis dataKey={msg.xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
            <Bar dataKey={msg.yKey} fill="#8884d8" />
          </BarChart>
        )}
        {msg.chartType === "line" && (
          <LineChart {...chartProps}>
            <XAxis dataKey={msg.xKey} />
            <YAxis />
            <Tooltip />
            <Legend />
            <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
            <Line type="monotone" dataKey={msg.yKey} stroke="#82ca9d" />
          </LineChart>
        )}
        {msg.chartType === "pie" && (
          <PieChart {...chartProps}>
            <Pie
              data={msg.data}
              dataKey={msg.yKey}
              nameKey={msg.xKey}
              cx="50%"
              cy="50%"
              outerRadius={120} // bigger radius
              fill="#8884d8"
              label
            />
            <Tooltip />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
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
        if (res.data.length > 0) setSelectedBusiness(res.data[0].id);
      } catch (err) {
        console.error("Failed to load businesses", err);
      }
    };
    loadBusinesses();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

    if (msg.type === "chart")
      return (
        <div key={index} className="assistant bubble">
          <ChartRenderer msg={msg} />
        </div>
      );

    if (msg.type === "sql")
      return (
        <div key={index} className="assistant bubble sql-box">
          <pre>{msg.query}</pre>
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
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div className="tagline">
          Enterprise Data Assistant powered by Databricks Genie
        </div>
      </header>

      <div className="chat-area">
        {messages.length === 0 && (
          <div className="welcome">
            Hello! Jarvis this side 👋🏻<br />
            How can I assist you today?
          </div>
        )}

        {messages.map((msg, index) => renderMessage(msg, index))}

        {loading && <div className="assistant bubble typing">Jarvis is thinking...</div>}

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