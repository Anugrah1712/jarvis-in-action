import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import { useMemo } from "react";
import html2canvas from "html2canvas";
import { Mic } from "lucide-react";
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
import { Copy, CheckCircle, AlertCircle, Download, Loader } from "lucide-react";

// ─────────────────────────────────────────────
// Toast notification system
// ─────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8
    }}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => removeToast(t.id)} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderRadius: 8, cursor: "pointer",
          background: t.type === "success" ? "#166534" : t.type === "error" ? "#7f1d1d" : "#1e3a5f",
          color: "#fff", fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          animation: "slideIn 0.2s ease",
          minWidth: 240, maxWidth: 360
        }}>
          {t.type === "success" && <CheckCircle size={16} style={{ flexShrink: 0 }} />}
          {t.type === "error"   && <AlertCircle  size={16} style={{ flexShrink: 0 }} />}
          {t.type === "loading" && <Loader size={16} style={{ flexShrink: 0, animation: "spin 1s linear infinite" }} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = (message, type = "success", duration = 3000) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }
    return id;
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const updateToast = (id, message, type, duration = 3000) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, message, type } : t));
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }
  };

  return { toasts, addToast, removeToast, updateToast };
}

// ─────────────────────────────────────────────
// Robust clipboard helper (works without HTTPS in some browsers)
// ─────────────────────────────────────────────
async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-HTTPS / older browsers
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("execCommand copy failed");
}

// ─────────────────────────────────────────────
// CSV download helper (client-side, always works)
// ─────────────────────────────────────────────
function downloadCSVLocal(data, filename = "export.csv") {
  if (!data || data.length === 0) throw new Error("No data to download");
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map(row =>
      headers.map(field => `"${String(row[field] ?? "").replace(/"/g, '""')}"`).join(",")
    )
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
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
  const [showHistory, setShowHistory] = useState(true);
  const [expandScope, setExpandScope] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const lastSentRef = useRef("");
  const transcriptRef = useRef("");

  // Per-message action states: { [msgIndex]: { downloading, copying, exportingPng } }
  const [actionStates, setActionStates] = useState({});

  const { toasts, addToast, removeToast, updateToast } = useToast();

  const setActionState = (index, key, value) =>
    setActionStates(prev => ({
      ...prev,
      [index]: { ...(prev[index] || {}), [key]: value }
    }));

  // ── Speech recognition ──────────────────────
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { console.warn("Speech Recognition not supported"); return; }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += t;
        else interimTranscript += t;
      }
      const combined = finalTranscript + interimTranscript;
      setPrompt(combined);
      transcriptRef.current = combined;
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  // ── Load businesses ──────────────────────────
  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const res = await axios.get("/api/businesses");
        setBusinesses(res.data);
        if (res.data.length > 0) setSelectedBusiness(res.data[0].id);
      } catch (err) {
        console.error("Failed to load businesses", err);
      }
    };
    fetchBusinesses();
  }, []);

  // ── Resize listener ──────────────────────────
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Auto-scroll ──────────────────────────────
  useEffect(() => {
    if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Helpers ──────────────────────────────────
  const scrollToTop    = () => chatRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });

  const selectedBusinessObj = useMemo(
    () => businesses.find(b => b.id === selectedBusiness),
    [businesses, selectedBusiness]
  );

  const clearChat = () => { setMessages([]); setConversationId(null); };

  const startListening = () => {
    if (recognitionRef.current && !listening) {
      try {
        recognitionRef.current.finalTranscript = "";
        recognitionRef.current.start();
        setListening(true);
      } catch (e) { console.warn("Mic start error:", e); }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListening(false);
    const text = transcriptRef.current.trim();
    if (text && text !== lastSentRef.current) {
      lastSentRef.current = text;
      sendMessage(text);
    }
    transcriptRef.current = "";
    setPrompt("");
  };

  const loadSession = (session) => {
    setConversationId(session.id);
    setMessages(session.messages);
    setSelectedBusiness(session.business);
  };

  const formatValue = (value, granularity = "daily", columnName = "") => {
    if (columnName.toLowerCase().includes("month")) return value;
    if (!isNaN(value) && value !== null && value !== "") return Number(value).toLocaleString();
    if (typeof value === "string" && !isNaN(Date.parse(value))) {
      const date = new Date(value);
      if (granularity === "monthly") return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
    return value;
  };

  const isNumeric  = (value) => !isNaN(value) && value !== null && value !== "";
  const isDate     = (value) => typeof value === "string" && !isNaN(Date.parse(value));

  const detectDateGranularity = (data, dateKey) => {
    if (!data || data.length < 2) return "daily";
    const dates = data.map(row => new Date(row[dateKey])).filter(d => !isNaN(d)).sort((a, b) => a - b);
    if (dates.length < 2) return "daily";
    return (dates[1] - dates[0]) / (1000 * 60 * 60 * 24) >= 28 ? "monthly" : "daily";
  };

  const detectChartType = (data) => {
    if (!data || data.length === 0) return null;
    const keys = Object.keys(data[0]);
    const numericKeys  = keys.filter(k => isNumeric(data[0][k]));
    const categoryKey  = keys.find(k => !numericKeys.includes(k));
    if (!categoryKey || numericKeys.length === 0) return null;
    if (data.length === 1) return "pie";
    if (numericKeys.length > 1) return "bar";
    if (isDate(data[0][categoryKey]) && numericKeys.length === 1) return "line";
    return "bar";
  };

  const BAR_COLORS = ["#38bdf8", "#2563eb", "#0ea5e9", "#1d4ed8"];

  // ── COPY HELPERS (with feedback) ─────────────
  const handleCopyText = async (text, label = "Copied!") => {
    try {
      await copyTextToClipboard(text);
      addToast(`✓ ${label}`, "success");
    } catch {
      addToast("Copy failed — try selecting text manually", "error");
    }
  };

  const handleCopyTable = async (data, index) => {
    if (!data || data.length === 0) { addToast("No data to copy", "error"); return; }
    setActionState(index, "copying", true);
    try {
      const headers = Object.keys(data[0]);
      const rows = [headers.join("\t"), ...data.map(row => headers.map(f => row[f] ?? "").join("\t"))];
      await copyTextToClipboard(rows.join("\n"));
      addToast("✓ Table copied to clipboard", "success");
    } catch {
      addToast("Copy failed — try a different browser or HTTPS", "error");
    } finally {
      setActionState(index, "copying", false);
    }
  };

  // ── DOWNLOAD FULL DATA (with loading toast) ───
  const handleDownloadFullData = async (generatedCode, data, index) => {
    if (!generatedCode) {
      // No server query available — fall back to local CSV of visible data
      if (data && data.length > 0) {
        try {
          downloadCSVLocal(data, `export_${Date.now()}.csv`);
          addToast("✓ Downloaded visible data as CSV", "success");
        } catch (e) {
          addToast("Download failed: " + e.message, "error");
        }
      } else {
        addToast("No SQL query available and no data to export", "error");
      }
      return;
    }

    setActionState(index, "downloading", true);
    const toastId = addToast("⏳ Fetching full dataset…", "loading", 0); // persistent

    try {
      const res = await axios.post(
        "/api/download",
        { query: generatedCode },
        { timeout: 0 }
      );

      const fullData = res.data?.data;

      if (!fullData || fullData.length === 0) {
        updateToast(toastId, "No data returned from server", "error");
        return;
      }

      downloadCSVLocal(fullData, `full_export_${Date.now()}.csv`);
      updateToast(toastId, `✓ Downloaded ${fullData.length.toLocaleString()} rows`, "success");
    } catch (err) {
      console.error("Download error:", err);
      // Fallback: download the visible data the user already has
      if (data && data.length > 0) {
        try {
          downloadCSVLocal(data, `export_visible_${Date.now()}.csv`);
          updateToast(toastId, "⚠ Server failed — downloaded visible rows instead", "error");
        } catch {
          updateToast(toastId, "Download failed. Check server connection.", "error");
        }
      } else {
        updateToast(toastId, "Download failed: " + (err.response?.data?.detail || err.message), "error");
      }
    } finally {
      setActionState(index, "downloading", false);
    }
  };

  // ── EXPORT CHART PNG ─────────────────────────
  const handleExportChart = async (id, index) => {
    const chart = document.getElementById(id);
    if (!chart) { addToast("Chart not found", "error"); return; }
    setActionState(index, "exportingPng", true);
    try {
      const canvas = await html2canvas(chart);
      const link = document.createElement("a");
      link.download = `chart_${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
      addToast("✓ Chart exported as PNG", "success");
    } catch (e) {
      addToast("PNG export failed: " + e.message, "error");
    } finally {
      setActionState(index, "exportingPng", false);
    }
  };

  // ── SEND MESSAGE ─────────────────────────────
  const sendMessage = async (customText = null, businessOverride = null) => {
    if (loading) return;
    const textToSend = customText ?? prompt;
    if (!textToSend.trim()) return;
    const activeBusiness = businessOverride ?? selectedBusiness;
    if (!activeBusiness) { console.error("No business selected"); return; }

    const userMessage = { role: "user", content: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    if (!customText) setPrompt("");
    setLoading(true);

    try {
      let response;
      let activeConversationId = conversationId;

      if (!conversationId) {
        response = await axios.post("/start", { prompt: textToSend, business: activeBusiness }, { timeout: 0 });
        activeConversationId = response.data.conversation_id;
        setConversationId(activeConversationId);
        setSessions(prev => [{
          id: activeConversationId,
          title: textToSend.slice(0, 40),
          business: activeBusiness,
          messages: [userMessage],
          createdAt: new Date(),
        }, ...prev]);
      } else {
        response = await axios.post(
          "/followup",
          { conversation_id: conversationId, prompt: textToSend, business: activeBusiness },
          { timeout: 0 }
        );
      }

      const genieResponses = response.data.response;
      let formatted = [];

      genieResponses.forEach(res => {
        if (res.type === "text") {
          formatted.push({ role: "assistant", type: "text", content: res.content, timestamp: new Date() });
        }
        if (res.type === "query") {
          formatted.push({
            role: "assistant", type: "table",
            description: res.description, data: res.data,
            generated_code: res.generated_code, timestamp: new Date()
          });
        }
        if (res.type === "chart") {
          formatted.push({ role: "assistant", type: "chart", data: res.data, timestamp: new Date() });
        }
      });

      setMessages(prev => [...prev, ...formatted]);
      setSessions(prev =>
        prev.map(session =>
          session.id === activeConversationId
            ? { ...session, messages: [...session.messages, userMessage, ...formatted] }
            : session
        )
      );
    } catch (error) {
      console.error("API Error:", error);
      setMessages(prev => [...prev, {
        role: "assistant", type: "text", timestamp: new Date(),
        content: "⚠️ Genie encountered an issue while processing your query. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── RENDER MESSAGES ──────────────────────────
  const renderMessage = (msg, index) => {
    const state = actionStates[index] || {};

    if (msg.role === "user") {
      return (
        <div key={index} className="message-wrapper user-wrapper">
          <div className="user bubble fade-in">
            <div className="message-content">{msg.content}</div>
            <div className="timestamp">{msg.timestamp?.toLocaleTimeString()}</div>
          </div>
          <div className="message-actions">
            <button className="copy-btn" onClick={() => handleCopyText(msg.content, "Message copied")}>
              <Copy size={14} /><span>Copy</span>
            </button>
          </div>
        </div>
      );
    }

    if (msg.type === "text") {
      return (
        <div key={index} className="assistant bubble fade-in">
          {msg.content}
          <div className="timestamp">{msg.timestamp?.toLocaleTimeString()}</div>
        </div>
      );
    }

    if (msg.type === "suggestion") {
      return (
        <div key={index} className="assistant bubble fade-in">
          <div className="suggestion-chip" onClick={() => sendMessage(msg.content)}>{msg.content}</div>
        </div>
      );
    }

    if (msg.type === "table" && msg.data?.length > 0) {
      const keys        = Object.keys(msg.data[0]);
      const numericKeys = keys.filter(k => !isNaN(msg.data[0][k]) && msg.data[0][k] !== null);
      const categoryKey = keys.find(k => !numericKeys.includes(k));
      const chartType   = detectChartType(msg.data);
      const granularity = categoryKey && isDate(msg.data[0][categoryKey])
        ? detectDateGranularity(msg.data, categoryKey) : "daily";

      return (
        <div key={index} className="assistant bubble fade-in">
          {msg.description && <div className="query-title">{msg.description}</div>}

          <div className="table-actions">
            {/* COPY TABLE */}
            <button
              className="download-btn"
              disabled={state.copying}
              onClick={() => handleCopyTable(msg.data, index)}
            >
              {state.copying
                ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> Copying…</>
                : "📋 Copy Table"}
            </button>

            {/* DOWNLOAD FULL DATA */}
            <button
              className="download-btn"
              disabled={state.downloading}
              onClick={() => handleDownloadFullData(msg.generated_code, msg.data, index)}
            >
              {state.downloading
                ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> Downloading…</>
                : <><Download size={13} /> Download Full Data</>}
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
                      const isNum = msg.data.length > 0 && !isNaN(msg.data[0][col]) && msg.data[0][col] !== null;
                      return <th key={i} className={isNum ? "numeric-column" : ""}>{col}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {msg.data.slice(0, 100).map((row, i) => (
                    <tr key={i}>
                      {keys.map((key, j) => {
                        const isNum = !isNaN(row[key]) && row[key] !== null;
                        return (
                          <td key={j} className={isNum ? "numeric-column" : ""}>
                            {formatValue(row[key], granularity, key)}
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
                  onClick={() => handleCopyText(msg.generated_code, "SQL copied")}
                >
                  Copy
                </button>
              </summary>
              <pre>{msg.generated_code}</pre>
            </details>
          )}

          {/* CHART */}
          {chartType && categoryKey && numericKeys.length > 0 && (
            <div id={`chart-${index}`} className="chart-wrapper fade-in">
              <button
                className="download-btn"
                style={{ marginBottom: 10 }}
                disabled={state.exportingPng}
                onClick={() => handleExportChart(`chart-${index}`, index)}
              >
                {state.exportingPng
                  ? <><Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> Exporting…</>
                  : "📊 Export PNG"}
              </button>

              <ResponsiveContainer width="100%" height={350}>
                {chartType === "line" && (
                  <LineChart data={msg.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={categoryKey}
                      tickFormatter={value => {
                        if (!isDate(value)) return value;
                        const date = new Date(value);
                        return granularity === "monthly"
                          ? date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
                          : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                      }}
                      tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {numericKeys.map((key, i) => (
                      <Line key={i} type="monotone" dataKey={key}
                        stroke={BAR_COLORS[i % BAR_COLORS.length]}
                        strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} animationDuration={1000} />
                    ))}
                  </LineChart>
                )}
                {chartType === "bar" && (
                  <BarChart data={msg.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={categoryKey}
                      tickFormatter={value => {
                        if (!isDate(value)) return value;
                        const date = new Date(value);
                        return granularity === "monthly"
                          ? date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
                          : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                      }}
                      tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {numericKeys.map((key, i) => (
                      <Bar key={i} dataKey={key} fill={BAR_COLORS[i % BAR_COLORS.length]}
                        animationDuration={1000} radius={[6, 6, 0, 0]} />
                    ))}
                  </BarChart>
                )}
                {chartType === "pie" && (
                  <PieChart>
                    <Tooltip /><Legend />
                    <Pie data={msg.data} dataKey={numericKeys[0]} nameKey={categoryKey}
                      outerRadius={120} label animationDuration={1000} />
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

  // ── RENDER ───────────────────────────────────
  return (
    <div className={`app-container dark ${!showHistory && isMobile ? "full-width" : ""}`}>

      {/* Toast notifications */}
      <Toast toasts={toasts} removeToast={removeToast} />

      {/* Keyframe styles injected inline so App.css doesn't need changes */}
      <style>{`
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin    { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
        .download-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .download-btn svg { display: inline-block; vertical-align: middle; margin-right: 4px; }
      `}</style>

      {/* SIDEBAR */}
      {showHistory && (
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>History</h3>
            <button onClick={clearChat}>+ New Chat</button>
          </div>
          <div className="session-list">
            {sessions
              .filter(s => s.business === selectedBusiness)
              .map(session => (
                <div
                  key={session.id}
                  className={`session-item ${session.id === conversationId ? "active" : ""}`}
                  onClick={() => loadSession(session)}
                >
                  <div className="session-title">{session.title}</div>
                  <div className="session-date">{new Date(session.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
          </div>
        </div>
      )}
      {showHistory && isMobile && (
        <div className="mobile-overlay" onClick={() => setShowHistory(false)} />
      )}

      {/* MAIN CHAT AREA */}
      <div className="main-content">

        <header className="header">
          <div className="header-left">
            <button className="history-toggle" onClick={() => setShowHistory(prev => !prev)}>
              {showHistory ? "☰ Hide" : "☰ History"}
            </button>
          </div>
          <div className="header-center">
            <label>Select Business:</label>
            <select
              value={selectedBusiness}
              onChange={e => {
                setSelectedBusiness(e.target.value);
                setConversationId(null);
                setMessages([]);
              }}
            >
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="header-right" />
        </header>

        {selectedBusinessObj?.scope && (
          <div className="scope-box">
            {expandScope ? selectedBusinessObj.scope : selectedBusinessObj.scope.slice(0, 120) + "..."}
            {selectedBusinessObj.scope.length > 120 && (
              <span className="read-more" onClick={() => setExpandScope(!expandScope)}>
                {expandScope ? " Read less" : " Read more"}
              </span>
            )}
          </div>
        )}

        <div className="chat-area" ref={chatRef}>
          {messages.length === 0 && (
            <div className="welcome">Hello!👋<br />How can I assist you today?</div>
          )}
          <div className="scroll-buttons">
            <button onClick={scrollToTop}>⬆</button>
            <button onClick={scrollToBottom}>⬇</button>
          </div>
          {messages.map((msg, index) => renderMessage(msg, index))}
          {loading && <div className="assistant bubble typing">I'm thinking </div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-box">
          <textarea
            className="chat-input"
            value={prompt}
            rows={1}
            placeholder="Ask me something magical..."
            onChange={e => {
              setPrompt(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
          />
          <button
            className={`mic-btn ${listening ? "active" : ""}`}
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
          >
            <Mic size={18} />
          </button>
          <button type="button" onClick={() => sendMessage()} disabled={loading}>
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;