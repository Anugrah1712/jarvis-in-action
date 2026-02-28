import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import logo from "./bajajlogo.png";
import { useMemo } from "react";
import html2canvas from "html2canvas";
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
  ResponsiveContainer,
  Legend,
} from "recharts";

function App() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const messagesEndRef = useRef(null);
  const [sessions, setSessions] = useState([]);
  const chatRef = useRef(null);
  useEffect(() => {
  const fetchBusinesses = async () => {
    try {
      const res = await axios.get("/api/businesses");
      setBusinesses(res.data);

      // Auto select first business
      if (res.data.length > 0) {
        setSelectedBusiness(res.data[0].id);
      }
    } catch (err) {
      console.error("Failed to load businesses", err);
    }
  };

  fetchBusinesses();
}, []);

  const scrollToTop = () => {
  chatRef.current?.scrollTo({ top: 0, behavior: "smooth" });
};

  const scrollToBottom = () => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  const selectedBusinessObj = useMemo(() => {
  return businesses.find((b) => b.id === selectedBusiness);
}, [businesses, selectedBusiness]);

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
};

const exportChart = (id) => {
  const chart = document.getElementById(id);
  if (!chart) return;

  html2canvas(chart).then(canvas => {
    const link = document.createElement("a");
    link.download = "chart.png";
    link.href = canvas.toDataURL();
    link.click();
  });
};

  // Auto-scroll
  useEffect(() => {
    if (!loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Format numbers with commas
  const formatValue = (value, granularity = "daily") => {
    if (!isNaN(value) && value !== null && value !== "") {
      return Number(value).toLocaleString();
    }

    if (typeof value === "string" && !isNaN(Date.parse(value))) {
      const date = new Date(value);

      if (granularity === "monthly") {
        return date.toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric",
        });
      }

      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    return value;
  };

  const loadSession = (session) => {
  setConversationId(session.id);
  setMessages(session.messages);
  setSelectedBusiness(session.business);
};

  const sendMessage = async (customText = null) => {
  if (loading) return;

  const textToSend = customText ?? prompt;
  if (!textToSend.trim()) return;

  const userMessage = {
    role: "user",
    content: textToSend,
    timestamp: new Date(),
  };

  setMessages((prev) => [...prev, userMessage]);

  if (!customText) setPrompt("");
  setLoading(true);

  try {
    let response;
    let activeConversationId = conversationId;

    if (!conversationId) {
      response = await axios.post(
        `/start`,
        {
          prompt: textToSend,
          business: selectedBusiness,
        },
        { timeout: 0 } // 🔥 REMOVE TIMEOUT LIMIT
      );

      activeConversationId = response.data.conversation_id;
      setConversationId(activeConversationId);

      setSessions((prev) => [
        {
          id: activeConversationId,
          title: textToSend.slice(0, 40),
          business: selectedBusiness,
          messages: [userMessage],
          createdAt: new Date(),
        },
        ...prev,
      ]);
    } else {
      response = await axios.post(
        `/followup`,
        {
          conversation_id: conversationId,
          prompt: textToSend,
          business: selectedBusiness,
        },
        { timeout: 0 } // 🔥 REMOVE TIMEOUT LIMIT
      );
    }

    const genieResponses = response.data.response;
    let formatted = [];

    genieResponses.forEach((res) => {
      if (res.type === "text") {
        formatted.push({
          role: "assistant",
          type: "text",
          content: res.content,
          timestamp: new Date(),
        });
      }

      if (res.type === "query") {
        formatted.push({
          role: "assistant",
          type: "table",
          description: res.description,
          data: res.data,
          generated_code: res.generated_code,
          timestamp: new Date(),
        });
      }

      if (res.type === "chart") {
        formatted.push({
          role: "assistant",
          type: "chart",
          data: res.data,
          timestamp: new Date(),
        });
      }
    });

    setMessages((prev) => [...prev, ...formatted]);

    setSessions(prev =>
      prev.map(session =>
        session.id === activeConversationId
          ? {
              ...session,
              messages: [...session.messages, userMessage, ...formatted]
            }
          : session
      )
    );

  } catch (error) {
    console.error("API Error:", error);

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        type: "text",
        timestamp: new Date(),
        content:
          "⚠️ Genie encountered an issue while processing your query. Please try again.",
      },
    ]);
  } finally {
    setLoading(false);  // 🔥 ALWAYS EXECUTES
  }
};

  const isNumeric = (value) =>
  !isNaN(value) && value !== null && value !== "";

const isDate = (value) =>
  typeof value === "string" && !isNaN(Date.parse(value));

const detectDateGranularity = (data, dateKey) => {
  if (!data || data.length < 2) return "daily";

  const dates = data
    .map(row => new Date(row[dateKey]))
    .filter(d => !isNaN(d));

  if (dates.length < 2) return "daily";

  // Sort dates
  dates.sort((a, b) => a - b);

  const diffInDays =
    (dates[1] - dates[0]) / (1000 * 60 * 60 * 24);

  // If gap >= 28 days → likely monthly
  if (diffInDays >= 28) return "monthly";

  return "daily";
};

const detectChartType = (data) => {
  if (!data || data.length === 0) return null;

  const keys = Object.keys(data[0]);

  const numericKeys = keys.filter((k) =>
    isNumeric(data[0][k])
  );

  const categoryKey = keys.find((k) => !numericKeys.includes(k));

  if (!categoryKey || numericKeys.length === 0) return null;

  const isDateCategory = isDate(data[0][categoryKey]);

  // 🔹 If only one row → Pie
  if (data.length === 1) return "pie";

  // 🔹 If more than 1 numeric column → Bar (comparison)
  if (numericKeys.length > 1) return "bar";

  // 🔹 If category is date AND single metric → Line
  if (isDateCategory && numericKeys.length === 1) return "line";

  // 🔹 If category is NOT date → Bar
  if (!isDateCategory) return "bar";

  return "line";
};

const downloadCSV = (data, filename = "jarvis_data.csv") => {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);

  const csvRows = [
    headers.join(","), // header row
    ...data.map(row =>
      headers.map(field => {
        const value = row[field] ?? "";
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(",")
    )
  ];

  const csvString = csvRows.join("\n");

  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

  const BAR_COLORS = ["#38bdf8", "#2563eb", "#0ea5e9", "#1d4ed8"];


  const renderMessage = (msg, index) => {
  if (msg.role === "user") {
    return (
      <div key={index} className="user bubble fade-in">
        {msg.content}
        <div className="timestamp">
          {msg.timestamp?.toLocaleTimeString()}
        </div>
      </div>
    );
  }

  if (msg.type === "text") {
    return (
      <div key={index} className="assistant bubble fade-in">
        {msg.content}
        <div className="timestamp">
          {msg.timestamp?.toLocaleTimeString()}
        </div>
      </div>
    );
  }

  if (msg.type === "suggestion") {
    return (
      <div key={index} className="assistant bubble fade-in">
        <div
          className="suggestion-chip"
          onClick={() => sendMessage(msg.content)}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === "table" && msg.data?.length > 0) {
    const keys = Object.keys(msg.data[0]);

    const numericKeys = keys.filter((k) =>
      !isNaN(msg.data[0][k]) && msg.data[0][k] !== null
    );

    const categoryKey = keys.find((k) => !numericKeys.includes(k));

    const chartType = detectChartType(msg.data);

    const granularity =
      categoryKey && isDate(msg.data[0][categoryKey])
        ? detectDateGranularity(msg.data, categoryKey)
        : "daily";

    return (
      <div key={index} className="assistant bubble fade-in">
        {msg.description && (
          <div className="query-title">{msg.description}</div>
        )}

        <div className="table-actions">
          <button
          className="download-btn"
          onClick={() => copyToClipboard(JSON.stringify(msg.data, null, 2))}
        >
          📋 Copy Table
        </button>

          <button
            className="download-btn"
            onClick={() =>
              downloadCSV(
                msg.data,
                `jarvis_export_${Date.now()}.csv`
              )
            }
          >
            ⬇ Download CSV
          </button>
        </div>

        <div className="row-info">
          Showing {Math.min(100, msg.data.length)} of {msg.data.length} rows
        </div>

        {/* TABLE */}
        <div className="data-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {keys.map((col, i) => {
                  const isNumeric =
                    msg.data.length > 0 &&
                    !isNaN(msg.data[0][col]) &&
                    msg.data[0][col] !== null;

                  return (
                    <th
                      key={i}
                      className={isNumeric ? "numeric-column" : ""}
                    >
                      {col}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {msg.data.slice(0, 100).map((row, i) => (
                <tr key={i}>
                  {keys.map((key, j) => {
                    const isNumeric =
                      !isNaN(row[key]) && row[key] !== null;

                    return (
                      <td
                        key={j}
                        className={isNumeric ? "numeric-column" : ""}
                      >
                        {formatValue(row[key], granularity)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>

        {/* SQL */}
        {msg.generated_code && (
          <details className="sql-box">
            <summary>
              View Generated SQL
              <button
                style={{ marginLeft: 10 }}
                onClick={() => copyToClipboard(msg.generated_code)}
              >
                Copy
              </button>
            </summary>
            <pre>{msg.generated_code}</pre>
          </details>
        )}

        {/* CHART AFTER TABLE */}
        {chartType && categoryKey && numericKeys.length > 0 && (
          <div id={`chart-${index}`} className="chart-wrapper fade-in">
            <button
              className="download-btn"
              style={{ marginBottom: 10 }}
              onClick={() => exportChart(`chart-${index}`)}
            >
              📊 Export PNG
            </button>
            <ResponsiveContainer width="100%" height={350}>
              {chartType === "line" && (
                <LineChart data={msg.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={categoryKey}
                    tickFormatter={(value) => {
                      if (!isDate(value)) return value;

                      const date = new Date(value);

                      if (granularity === "monthly") {
                        return date.toLocaleDateString("en-IN", {
                          month: "short",
                          year: "2-digit",
                        });
                      }

                      return date.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      });
                    }}
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {numericKeys.map((key, i) => (
                    <Line
                      key={i}
                      type="monotone"
                      dataKey={key}
                      stroke={BAR_COLORS[i % BAR_COLORS.length]}
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 8 }}
                      animationDuration={1000}
                    />
                  ))}
                </LineChart>
              )}

              {chartType === "bar" && (
                <BarChart data={msg.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={categoryKey}
                    tickFormatter={(value) => {
                      if (!isDate(value)) return value;

                      const date = new Date(value);

                      if (granularity === "monthly") {
                        return date.toLocaleDateString("en-IN", {
                          month: "short",
                          year: "2-digit",
                        });
                      }

                      return date.toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      });
                    }}
                    tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {numericKeys.map((key, i) => (
                  <Bar
                    key={i}
                    dataKey={key}
                    fill={BAR_COLORS[i % BAR_COLORS.length]}
                    animationDuration={1000}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
                </BarChart>
              )}

              {chartType === "pie" && (
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={msg.data}
                    dataKey={numericKeys[0]}
                    nameKey={categoryKey}
                    outerRadius={120}
                    label
                    animationDuration={1000}
                  />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  return null;
};

  return (
  <div className="app-container dark">
    
    {/* SIDEBAR */}
    <div className="sidebar">
      <div className="sidebar-header">
        <h3>History</h3>
        <button onClick={clearChat}>+ New Chat</button>
      </div>

      <div className="session-list">
        {sessions
        .filter(s => s.business === selectedBusiness)
        .map((session) => (
          <div
            key={session.id}
            className={`session-item ${
              session.id === conversationId ? "active" : ""
            }`}
            onClick={() => loadSession(session)}
          >
            <div className="session-title">
              {session.title}
            </div>
            <div className="session-date">
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* MAIN CHAT AREA */}
    <div className="main-content">

      <header className="header">
        <img src={logo} className="logo-right" alt="logo" />
        <h1 className="title">JARVIS</h1>
      </header>

      {/* BUSINESS SELECTOR */}
      <div className="business-selector">
        <label>Select Business:</label>
        <select
          value={selectedBusiness}
          onChange={(e) => {
            setSelectedBusiness(e.target.value);
            setConversationId(null);
            setMessages([]);
          }}
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {selectedBusinessObj?.scope && (
        <div className="scope-box">
          {selectedBusinessObj.scope}
        </div>
      )}

      {/* CHAT AREA */}
      <div className="chat-area" ref={chatRef}>
        {messages.length === 0 && (
          <div className="welcome">
            Hello! Jarvis here 👋
            <br />
            How can I assist you today?
          </div>
        )}

        <div className="scroll-buttons">
          <button onClick={scrollToTop}>⬆</button>
          <button onClick={scrollToBottom}>⬇</button>
        </div>

        {messages.map((msg, index) => renderMessage(msg, index))}

        {loading && (
          <div className="assistant bubble typing">
            Jarvis is thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
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
  </div>
);
}

export default App;