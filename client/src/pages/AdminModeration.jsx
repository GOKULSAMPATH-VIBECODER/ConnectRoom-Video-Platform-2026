
import React, { useCallback, useEffect, useState } from "react";

const API = "http://localhost:5000";

export default function AdminModeration() {
  const [moderation, setModeration] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    "";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API}/api/admin/comments/moderation`,
        { headers }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load moderation data.");
      }

      setModeration(
        data.moderation || data.items || data.queue || []
      );
      setReports(data.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function moderate(id, action) {
    if (busy) return;

    setBusy(id);

    try {
      const response = await fetch(
        `${API}/api/admin/comments/moderation/${id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Moderation failed.");
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function reviewReport(id, status) {
    if (busy) return;

    setBusy(id);

    try {
      const response = await fetch(
        `${API}/api/admin/comments/reports/${id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Report update failed.");
      }

      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const panel = {
    background: "var(--card-bg, #202938)",
    color: "var(--text-color, #ffffff)",
    padding: "18px",
    borderRadius: "12px",
    marginBottom: "16px",
    border: "1px solid var(--border-color, #394456)",
  };

  const button = {
    padding: "9px 14px",
    margin: "6px 8px 0 0",
    border: "0",
    borderRadius: "7px",
    cursor: "pointer",
    fontWeight: "600",
  };

  if (!token) {
    return <main style={{ padding: 24 }}>Please log in as an administrator.</main>;
  }

  return (
    <main style={{ maxWidth: 1000, margin: "30px auto", padding: 20 }}>
      <h1>ConnectRoom Admin Moderation</h1>
      <p>Review automatically flagged comments and user reports.</p>

      <button
        style={{ ...button, background: "#2563eb", color: "white" }}
        onClick={loadData}
        disabled={loading}
      >
        {loading ? "Loading..." : "Refresh"}
      </button>

      {error && (
        <p role="alert" style={{ color: "#ef4444", marginTop: 15 }}>
          {error}
        </p>
      )}

      <h2 style={{ marginTop: 28 }}>
        Flagged comments ({moderation.length})
      </h2>

      {!loading && moderation.length === 0 && (
        <p>No pending flagged comments.</p>
      )}

      {moderation.map((item) => (
        <section key={item._id} style={panel}>
          <p><strong>Reason:</strong> {item.reason}</p>
          <p><strong>Details:</strong> {item.details || "Automatically flagged"}</p>
          <p>
            <strong>Comment:</strong>{" "}
            {item.commentId?.text || "Comment unavailable"}
          </p>
          <p>
            <strong>User:</strong>{" "}
            {item.userId?.name || "Unknown user"}
          </p>

          <button
            style={{ ...button, background: "#16a34a", color: "white" }}
            disabled={busy === item._id}
            onClick={() => moderate(item._id, "approve")}
          >
            Approve
          </button>

          <button
            style={{ ...button, background: "#dc2626", color: "white" }}
            disabled={busy === item._id}
            onClick={() => moderate(item._id, "remove")}
          >
            Remove comment
          </button>
        </section>
      ))}

      <h2 style={{ marginTop: 30 }}>User reports ({reports.length})</h2>

      {!loading && reports.length === 0 && <p>No pending reports.</p>}

      {reports.map((report) => (
        <section key={report._id} style={panel}>
          <p><strong>Reason:</strong> {report.reason}</p>
          <p><strong>Details:</strong> {report.details || "No additional details"}</p>
          <p>
            <strong>Comment:</strong>{" "}
            {report.commentId?.text || "Comment unavailable"}
          </p>

          <button
            style={{ ...button, background: "#2563eb", color: "white" }}
            disabled={busy === report._id}
            onClick={() => reviewReport(report._id, "reviewed")}
          >
            Mark reviewed
          </button>

          <button
            style={{ ...button, background: "#64748b", color: "white" }}
            disabled={busy === report._id}
            onClick={() => reviewReport(report._id, "dismissed")}
          >
            Dismiss
          </button>

          <button
            style={{ ...button, background: "#dc2626", color: "white" }}
            disabled={busy === report._id}
            onClick={() => reviewReport(report._id, "action_taken")}
          >
            Action taken
          </button>
        </section>
      ))}
    </main>
  );
}
