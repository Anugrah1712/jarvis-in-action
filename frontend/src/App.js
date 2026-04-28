import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";
import { useMemo } from "react";
import html2canvas from "html2canvas";
import { Mic, Copy, CheckCircle, AlertCircle, Download } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";

// ─────────────────────────────────────────────
// Global keyframes injected once into <head>
// ─────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes slideInUp {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes spinAnim {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes dotPulse {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40%           { opacity: 1;   transform: scale(1); }
  }
  .btn-spinner {
    display: inline-block;
    width: 13px; height: 13px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spinAnim 0.7s linear infinite;
    vertical-align: middle;
    flex-shrink: 0;
  }
  .download-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .download-btn { display: inline-flex; align-items: center; gap: 5px; }
  .typing-dot {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    margin: 0 2px;
    animation: dotPulse 1.2s infinite ease-in-out;
  }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
`;

if (!document.getElementById("app-global-styles")) {
  const tag = document.createElement("style");
  tag.id = "app-global-styles";
  tag.textContent = GLOBAL_STYLES;
  document.head.appendChild(tag);
}

// ─────────────────────────────────────────────
// Pure CSS spinner — no lucide dependency
// ─────────────────────────────────────────────
function Spinner() {
  return <span className="btn-spinner" aria-hidden="true" />;
}

// ─────────────────────────────────────────────
// Toast notification system
// ─────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div style={{
  position: "fixed",
  bottom: 40,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  pointerEvents: "none",
}}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "11px 16px", borderRadius: 10,
            cursor: "pointer", pointerEvents: "all",
            background:
              t.type === "success" ? "#14532d" :
              t.type === "error"   ? "#7f1d1d" : "#1e3a5f",
            color: "#fff", fontSize: 13, fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            animation: "slideInUp 0.2s ease",
            minWidth: 220, maxWidth: 360, lineHeight: 1.4,
          }}
        >
          {t.type === "success" && <CheckCircle size={15} style={{ flexShrink: 0 }} />}
          {t.type === "error"   && <AlertCircle  size={15} style={{ flexShrink: 0 }} />}
          {t.type === "loading" && <Spinner />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const addToast = (message, type = "success", duration = 3000) => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    return id;
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const updateToast = (id, message, type, duration = 3500) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, message, type } : t));
    if (duration > 0) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  };

  return { toasts, addToast, removeToast, updateToast };
}

// ─────────────────────────────────────────────
// Clipboard helper with execCommand fallback
// ─────────────────────────────────────────────
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("execCommand copy failed");
}

// ─────────────────────────────────────────────
// CSV download — pure client-side
// ─────────────────────────────────────────────
function triggerCSVDownload(data, filename = "export.csv") {
  if (!data || data.length === 0) throw new Error("No data to download");
  const headers = Object.keys(data[0]);
  const rows = [
    headers.join(","),
    ...data.map(row =>
      headers.map(f => `"${String(row[f] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
const BAR_COLORS = ["#38bdf8", "#2563eb", "#0ea5e9", "#1d4ed8"];

export default function App() {
  const [prompt, setPrompt]                     = useState("");
  const [messages, setMessages]                 = useState([]);
  const [conversationId, setConversationId]     = useState(null);
  const [loading, setLoading]                   = useState(false);
  const [businesses, setBusinesses]             = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [sessions, setSessions]                 = useState([]);
  const [showHistory, setShowHistory]           = useState(true);
  const [expandScope, setExpandScope]           = useState(false);
  const [isMobile, setIsMobile]                 = useState(window.innerWidth <= 768);
  const [listening, setListening]               = useState(false);
  const [actionStates, setActionStates]         = useState({});

  const messagesEndRef = useRef(null);
  const chatRef        = useRef(null);
  const recognitionRef = useRef(null);
  const lastSentRef    = useRef("");
  const transcriptRef  = useRef("");
  const textareaRef    = useRef(null);

  const { toasts, addToast, removeToast, updateToast } = useToast();

  const setActionState = (index, key, value) =>
    setActionStates(prev => ({
      ...prev,
      [index]: { ...(prev[index] || {}), [key]: value },
    }));

  // ── Speech recognition ──────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      let fin = "", int = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        e.results[i].isFinal ? (fin += t) : (int += t);
      }
      const combined = fin + int;
      setPrompt(combined);
      transcriptRef.current = combined;
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  // ── Load businesses ──────────────────────────
  useEffect(() => {
    axios.get("/api/businesses")
      .then(res => {
        setBusinesses(res.data);
        if (res.data.length > 0) setSelectedBusiness(res.data[0].id);
      })
      .catch(err => console.error("Failed to load businesses", err));
  }, []);

  // ── Resize listener ──────────────────────────
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── Auto-scroll ──────────────────────────────
  useEffect(() => {
    if (!loading) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const scrollToTop    = () => chatRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });

  const selectedBusinessObj = useMemo(
    () => businesses.find(b => b.id === selectedBusiness),
    [businesses, selectedBusiness]
  );

  const clearChat = () => { setMessages([]); setConversationId(null); };

  const startListening = () => {
    if (recognitionRef.current && !listening) {
      try { recognitionRef.current.start(); setListening(true); }
      catch (e) { console.warn("Mic error:", e); }
    }
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
    const text = transcriptRef.current.trim();
    if (text && text !== lastSentRef.current) {
      lastSentRef.current = text;
      sendMessage(text);
    }
    transcriptRef.current = "";
    setPrompt("");
  };

  const loadSession = (s) => {
    setConversationId(s.id);
    setMessages(s.messages);
    setSelectedBusiness(s.business);
  };

  // ── Formatting helpers ────────────────────────
  const isNumeric = (v) => v !== null && v !== "" && !isNaN(v);
  const isDate    = (v) => typeof v === "string" && !isNaN(Date.parse(v));

const isTimestamp = (v) =>
  typeof v === "string" && /T\d{2}:\d{2}/.test(v); // has a time component

const formatValue = (value, granularity = "daily", columnName = "") => {
  if (columnName.toLowerCase().includes("month")) return value;
  if (isNumeric(value)) return Number(value).toLocaleString();
  if (isDate(value)) {
    const d = new Date(value);
    // If raw string carries a time part (e.g. "2024-01-15T10:30:00"), show it
    if (isTimestamp(value)) {
      return d.toLocaleString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    }
    return granularity === "monthly"
      ? d.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  return value;
};

  const detectDateGranularity = (data, key) => {
    if (!data || data.length < 2) return "daily";
    const dates = data.map(r => new Date(r[key])).filter(d => !isNaN(d)).sort((a, b) => a - b);
    return dates.length >= 2 && (dates[1] - dates[0]) / 86400000 >= 28 ? "monthly" : "daily";
  };

  const detectChartType = (data) => {
    if (!data || data.length === 0) return null;
    const keys    = Object.keys(data[0]);
    const numKeys = keys.filter(k => isNumeric(data[0][k]));
    const catKey  = keys.find(k => !numKeys.includes(k));
    if (!catKey || numKeys.length === 0) return null;
    if (data.length === 1) return "pie";
    if (numKeys.length > 1) return "bar";
    if (isDate(data[0][catKey])) return "line";
    return "bar";
  };

  // ── Action handlers ───────────────────────────

  const handleCopyText = async (text, label = "Copied") => {
    try {
      await copyToClipboard(text);
      addToast(label, "success");
    } catch {
      addToast("Copy failed — try selecting text manually", "error");
    }
  };

  const handleCopyTable = async (data, index) => {
    if (!data || data.length === 0) { addToast("No data to copy", "error"); return; }
    setActionState(index, "copying", true);
    try {
      const headers = Object.keys(data[0]);
      const tsv = [
        headers.join("\t"),
        ...data.map(row => headers.map(f => row[f] ?? "").join("\t")),
      ].join("\n");
      await copyToClipboard(tsv);
      addToast("Table copied to clipboard", "success");
    } catch {
      addToast("Copy failed — try a different browser", "error");
    } finally {
      setActionState(index, "copying", false);
    }
  };

  const handleDownload = async (generatedCode, visibleData, index) => {
    // No SQL → download visible rows immediately (no server call)
    if (!generatedCode) {
      if (!visibleData || visibleData.length === 0) {
        addToast("Nothing to download", "error");
        return;
      }
      try {
        triggerCSVDownload(visibleData, `export_${Date.now()}.csv`);
        addToast(`Downloaded ${visibleData.length} visible rows`, "success");
      } catch (e) {
        addToast("Download failed: " + e.message, "error");
      }
      return;
    }

    // Has SQL → fetch full result from backend
    setActionState(index, "downloading", true);
    const tid = addToast("Fetching full dataset…", "loading", 0); // 0 = persistent toast

    try {
      const res = await axios.post("/api/download", { query: generatedCode }, { timeout: 0 });
      const fullData = res.data?.data;

      if (!fullData || fullData.length === 0) {
        updateToast(tid, "Server returned no data", "error");
        return;
      }

      triggerCSVDownload(fullData, `full_export_${Date.now()}.csv`);
      updateToast(tid, `Downloaded ${fullData.length.toLocaleString()} rows`, "success");

    } catch (err) {
      console.error("Download error:", err);
      // Always give the user something — fall back to visible rows
      if (visibleData && visibleData.length > 0) {
        try {
          triggerCSVDownload(visibleData, `export_fallback_${Date.now()}.csv`);
          updateToast(tid, `Server error — downloaded ${visibleData.length} visible rows instead`, "error");
        } catch {
          updateToast(tid, "Download failed. Check server connection.", "error");
        }
      } else {
        updateToast(tid, `Download failed: ${err.response?.data?.detail || err.message}`, "error");
      }
    } finally {
      setActionState(index, "downloading", false);
    }
  };

  const handleExportPNG = async (chartId, index) => {
    const el = document.getElementById(chartId);
    if (!el) { addToast("Chart element not found", "error"); return; }
    setActionState(index, "exportingPng", true);
    const tid = addToast("Rendering chart…", "loading", 0);
    try {
      const canvas = await html2canvas(el, { backgroundColor: "#1e293b" });
      const a = document.createElement("a");
      a.download = `chart_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      updateToast(tid, "Chart exported as PNG", "success");
    } catch (e) {
      updateToast(tid, "PNG export failed: " + e.message, "error");
    } finally {
      setActionState(index, "exportingPng", false);
    }
  };

  // ── Send message ──────────────────────────────
  const sendMessage = async (customText = null, businessOverride = null) => {
    if (loading) return;
    const text = customText ?? prompt;
    if (!text.trim()) return;
    const biz = businessOverride ?? selectedBusiness;
    if (!biz) return;

    const userMsg = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    // Reset textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    if (!customText) setPrompt("");
    setLoading(true);

    try {
      let res;
      let activeId = conversationId;

      if (!conversationId) {
        res = await axios.post("/start", { prompt: text, business: biz }, { timeout: 0 });
        activeId = res.data.conversation_id;
        setConversationId(activeId);
        setSessions(prev => [{
          id: activeId, title: text.slice(0, 40),
          business: biz, messages: [userMsg], createdAt: new Date(),
        }, ...prev]);
      } else {
        res = await axios.post(
          "/followup",
          { conversation_id: conversationId, prompt: text, business: biz },
          { timeout: 0 }
        );
      }

      const formatted = [];
      (res.data.response || []).forEach(r => {
        if (r.type === "text")  formatted.push({ role: "assistant", type: "text",  content: r.content, timestamp: new Date() });
        if (r.type === "query") formatted.push({ role: "assistant", type: "table", description: r.description, data: r.data, generated_code: r.generated_code, timestamp: new Date() });
        if (r.type === "chart") formatted.push({ role: "assistant", type: "chart", data: r.data, timestamp: new Date() });
      });

      setMessages(prev => [...prev, ...formatted]);
      setSessions(prev => prev.map(s =>
        s.id === activeId ? { ...s, messages: [...s.messages, userMsg, ...formatted] } : s
      ));
    } catch (err) {
      console.error("API error:", err);
      setMessages(prev => [...prev, {
        role: "assistant", type: "text", timestamp: new Date(),
        content: "⚠️ Genie hit an issue. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Render messages ───────────────────────────
  const renderMessage = (msg, index) => {
    const st = actionStates[index] || {};

    if (msg.role === "user") {
      return (
        <div key={index} className="message-wrapper user-wrapper">
          <div className="user bubble fade-in">
            <div className="message-content">{msg.content}</div>
            <div className="timestamp">{msg.timestamp?.toLocaleTimeString()}</div>
          </div>
          <div className="message-actions">
            <button className="copy-btn" onClick={() => handleCopyText(msg.content, "Message copied")}>
              <Copy size={13} /><span>Copy</span>
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
      const numericKeys = keys.filter(k => isNumeric(msg.data[0]?.[k]));
      const categoryKey = keys.find(k => !numericKeys.includes(k));
      const chartType   = detectChartType(msg.data);
      const granularity = categoryKey && isDate(msg.data[0]?.[categoryKey])
        ? detectDateGranularity(msg.data, categoryKey) : "daily";

      return (
        <div key={index} className="assistant bubble fade-in">
          {msg.description && <div className="query-title">{msg.description}</div>}

          {/* ── Action buttons ── */}
          <div className="table-actions">
            <button
              className="download-btn"
              disabled={!!st.copying}
              onClick={() => handleCopyTable(msg.data, index)}
            >
              {st.copying
                ? <><Spinner />Copying…</>
                : <><Copy size={13} />Copy Table</>
              }
            </button>

            <button
              className="download-btn"
              disabled={!!st.downloading}
              onClick={() => handleDownload(msg.generated_code, msg.data, index)}
            >
              {st.downloading
                ? <><Spinner />Downloading…</>
                : <><Download size={13} />Download Full Data</>
              }
            </button>
          </div>

          <div className="row-info">
            Showing {Math.min(100, msg.data.length)} of {msg.data.length} rows
          </div>

          {/* ── Table ── */}
          <div className="data-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {keys.map((col, i) => (
                      <th key={i} className={isNumeric(msg.data[0]?.[col]) ? "numeric-column" : ""}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {msg.data.slice(0, 100).map((row, i) => (
                    <tr key={i}>
                      {keys.map((k, j) => (
                        <td key={j} className={isNumeric(row[k]) ? "numeric-column" : ""}>
                          {formatValue(row[k], granularity, k)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── SQL ── */}
          {msg.generated_code && (
            <details className="sql-box">
              <summary>
                View Generated SQL
                <button
                  style={{ marginLeft: 10 }}
                  onClick={(e) => { e.preventDefault(); handleCopyText(msg.generated_code, "SQL copied"); }}
                >
                  Copy
                </button>
              </summary>
              <pre>{msg.generated_code}</pre>
            </details>
          )}

          {/* ── Chart ── */}
          {chartType && categoryKey && numericKeys.length > 0 && (
            <div id={`chart-${index}`} className="chart-wrapper fade-in">
              <button
                className="download-btn"
                style={{ marginBottom: 10 }}
                disabled={!!st.exportingPng}
                onClick={() => handleExportPNG(`chart-${index}`, index)}
              >
                {st.exportingPng ? <><Spinner />Exporting…</> : "Export PNG"}
              </button>

              {chartType === "line" && (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={msg.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={categoryKey}
                      tickFormatter={v => {
                        if (!isDate(v)) return v;
                        const d = new Date(v);
                        return granularity === "monthly"
                          ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
                          : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                      }}
                      tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                    <Tooltip /><Legend />
                    {numericKeys.map((k, i) => (
                      <Line key={i} type="monotone" dataKey={k}
                        stroke={BAR_COLORS[i % BAR_COLORS.length]}
                        strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} animationDuration={800} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}

              {chartType === "bar" && (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={msg.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={categoryKey}
                      tickFormatter={v => {
                        if (!isDate(v)) return v;
                        const d = new Date(v);
                        return granularity === "monthly"
                          ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
                          : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                      }}
                      tick={{ fill: "#cbd5e1", fontSize: 12 }}
                    />
                    <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                    <Tooltip /><Legend />
                    {numericKeys.map((k, i) => (
                      <Bar key={i} dataKey={k} fill={BAR_COLORS[i % BAR_COLORS.length]}
                        animationDuration={800} radius={[6, 6, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}

              {chartType === "pie" && (
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Tooltip /><Legend />
                    <Pie
                      data={msg.data}
                      dataKey={numericKeys[0]}
                      nameKey={categoryKey}
                      outerRadius={120}
                      label
                      animationDuration={800}
                      fill={BAR_COLORS[0]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>  
       );      
      }   
    return null;
  };

  // ── Main render ───────────────────────────────
  return (
    <div className={`app-container dark ${!showHistory && isMobile ? "full-width" : ""}`}>

      <Toast toasts={toasts} removeToast={removeToast} />

      {/* Sidebar */}
      {showHistory && (
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>History</h3>
            <button onClick={clearChat}>+ New Chat</button>
          </div>
          <div className="session-list">
            {sessions.filter(s => s.business === selectedBusiness).length === 0 && (
              <div style={{ padding: "16px 12px", fontSize: 13, color: "#64748b", textAlign: "center" }}>
                No conversations yet.<br />Ask something to get started!
              </div>
            )}
            {sessions
              .filter(s => s.business === selectedBusiness)
              .map(s => (
                <div
                  key={s.id}
                  className={`session-item ${s.id === conversationId ? "active" : ""}`}
                  onClick={() => loadSession(s)}
                >
                  <div className="session-title">{s.title}</div>
                  <div className="session-date">{new Date(s.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
          </div>
        </div>
      )}
      {showHistory && isMobile && (
        <div className="mobile-overlay" onClick={() => setShowHistory(false)} />
      )}

      {/* Main content */}
      <div className="main-content">
        <header className="header">
          <div className="header-left">
            <button className="history-toggle" onClick={() => setShowHistory(p => !p)}>
              {showHistory ? "☰ Hide" : "☰ History"}
            </button>
          </div>
          <div className="header-center">
            <label>Select Business:</label>
            <select value={selectedBusiness} onChange={e => {
              setSelectedBusiness(e.target.value);
              setConversationId(null);
              setMessages([]);
            }}>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="header-right" />
        </header>

        {selectedBusinessObj?.scope && (
          <div className="scope-box">
            {expandScope ? selectedBusinessObj.scope : selectedBusinessObj.scope.slice(0, 120) + "…"}
            {selectedBusinessObj.scope.length > 120 && (
              <span className="read-more" onClick={() => setExpandScope(p => !p)}>
                {expandScope ? " Read less" : " Read more"}
              </span>
            )}
          </div>
        )}

        <div className="chat-area" ref={chatRef}>
          {messages.length === 0 && (
            <div className="welcome">Hello! 👋<br />How can I assist you today?</div>
          )}
          <div className="scroll-buttons">
            <button onClick={scrollToTop}>⬆</button>
            <button onClick={scrollToBottom}>⬇</button>
          </div>

          {messages.map((msg, i) => renderMessage(msg, i))}

          {loading && (
            <div className="assistant bubble typing">
              Thinking
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-box">
          <textarea
            ref={textareaRef}
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
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            className={`mic-btn ${listening ? "active" : ""}`}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
          >
            <Mic size={18} />
          </button>
          <button type="button" onClick={() => sendMessage()} disabled={loading}>
            {loading ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}