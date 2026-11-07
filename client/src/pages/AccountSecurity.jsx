
import { useCallback, useEffect, useState } from "react";

const API = "http://localhost:5000/api/security";

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("authToken")
  );
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleString();
}

function AccountSecurity() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const token = getToken();

    if (!token) {
      throw new Error("Please log in to view account security.");
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("authToken");
        window.location.href = "/login";
      }

      throw new Error(
        result.message || "Security request failed."
      );
    }

    return result;
  }, []);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await request("/overview");
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  async function revokeSession(sessionId) {
    if (!window.confirm("Are you sure you want to revoke this session?")) {
      return;
    }

    try {
      setBusy(sessionId);
      setMessage("");

      const result = await request(
        `/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
      );

      setMessage(result.message);

      if (result.currentSession) {
        localStorage.removeItem("token");
        localStorage.removeItem("authToken");
        window.location.href = "/login";
        return;
      }

      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function revokeOtherSessions() {
    if (
      !window.confirm(
        "This will log out all other devices. Continue?"
      )
    ) {
      return;
    }

    try {
      setBusy("others");
      setMessage("");
      setError("");

      const result = await request(
        "/sessions/revoke-others",
        { method: "POST" }
      );

      setMessage(
        `${result.message} Revoked: ${result.revokedCount || 0}`
      );

      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function removeTrustedDevice(deviceId) {
    if (!window.confirm("Remove this trusted device?")) {
      return;
    }

    try {
      setBusy(deviceId);
      setMessage("");

      const result = await request(
        `/devices/${encodeURIComponent(deviceId)}`,
        { method: "DELETE" }
      );

      setMessage(result.message);
      await loadOverview();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const sessions = data?.sessions || [];
  const devices = data?.trustedDevices || [];
  const loginAttempts = data?.loginAttempts || [];
  const otpChallenges = data?.otpChallenges || [];

  const styles = {
    page: {
      maxWidth: "1100px",
      margin: "30px auto",
      padding: "20px",
      color: "var(--text-color, inherit)",
    },
    panel: {
      background: "var(--card-bg, #20242d)",
      border: "1px solid var(--border-color, #444)",
      borderRadius: "12px",
      padding: "20px",
      marginBottom: "20px",
    },
    heading: {
      marginTop: 0,
      marginBottom: "8px",
    },
    muted: {
      opacity: 0.7,
      fontSize: "14px",
    },
    button: {
      padding: "9px 14px",
      borderRadius: "7px",
      border: "1px solid var(--border-color, #777)",
      cursor: "pointer",
      fontWeight: 600,
    },
    danger: {
      background: "#b42318",
      color: "white",
      border: "none",
    },
    success: {
      background: "#087443",
      color: "white",
      padding: "12px",
      borderRadius: "7px",
      marginBottom: "15px",
    },
    error: {
      background: "#b42318",
      color: "white",
      padding: "12px",
      borderRadius: "7px",
      marginBottom: "15px",
    },
    item: {
      padding: "15px 0",
      borderBottom: "1px solid var(--border-color, #444)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "15px",
      flexWrap: "wrap",
    },
  };

  if (loading) {
    return <main style={styles.page}>Loading account security...</main>;
  }

  if (error && !data) {
    return (
      <main style={styles.page}>
        <h2>Account Security</h2>
        <p style={{ color: "#e05252" }}>{error}</p>
        <button style={styles.button} onClick={loadOverview}>
          Try again
        </button>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.item}>
        <div>
          <h1 style={styles.heading}>Account Security</h1>
          <p style={styles.muted}>
            Manage your login sessions, trusted devices and login activity.
          </p>
        </div>

        <button style={styles.button} onClick={loadOverview}>
          Refresh
        </button>
      </div>

      {message && <div style={styles.success}>{message}</div>}
      {error && <div style={styles.error}>{error}</div>}

      {/* ACTIVE SESSIONS */}
      <section style={styles.panel}>
        <div style={styles.item}>
          <div>
            <h2 style={styles.heading}>Active Sessions</h2>
            <p style={styles.muted}>
              Devices currently signed in to your account.
            </p>
          </div>

          <button
            style={{ ...styles.button, ...styles.danger }}
            onClick={revokeOtherSessions}
            disabled={busy === "others"}
          >
            {busy === "others" ? "Please wait..." : "Log out other devices"}
          </button>
        </div>

        {sessions.length === 0 ? (
          <p>No active sessions found.</p>
        ) : (
          sessions.map((session) => (
            <div key={session.sessionId} style={styles.item}>
              <div>
                <strong>
                  {session.device || "Unknown device"}
                  {session.isCurrent && (
                    <span style={{ color: "#16a36a" }}>
                      {" "}• This device
                    </span>
                  )}
                </strong>

                <p style={styles.muted}>
                  Browser: {session.browser || "Unknown"}
                </p>

                <p style={styles.muted}>
                  OS: {session.operatingSystem || "Unknown"}
                </p>

                <p style={styles.muted}>
                  IP: {session.ipAddress || "Unavailable"}
                </p>

                <p style={styles.muted}>
                  Last activity: {formatDate(session.lastActivityAt)}
                </p>

                <p style={styles.muted}>
                  Signed in: {formatDate(session.createdAt)}
                </p>

                <p style={styles.muted}>
                  Expires: {formatDate(session.expiresAt)}
                </p>
              </div>

              <button
                style={{ ...styles.button, ...styles.danger }}
                disabled={busy === session.sessionId}
                onClick={() => revokeSession(session.sessionId)}
              >
                {busy === session.sessionId
                  ? "Revoking..."
                  : "Revoke session"}
              </button>
            </div>
          ))
        )}
      </section>

      {/* TRUSTED DEVICES */}
      <section style={styles.panel}>
        <h2 style={styles.heading}>Trusted Devices</h2>
        <p style={styles.muted}>
          Devices approved for future logins without a new-device OTP challenge.
        </p>

        {devices.length === 0 ? (
          <p>No trusted devices found.</p>
        ) : (
          devices.map((device) => (
            <div key={device.id} style={styles.item}>
              <div>
                <strong>{device.browser || "Trusted device"}</strong>
                <p style={styles.muted}>
                  IP: {device.lastKnownIP || "Unavailable"}
                </p>
                <p style={styles.muted}>
                  Last seen: {formatDate(device.lastSeenAt)}
                </p>
                <p style={styles.muted}>
                  Trusted until: {formatDate(device.trustedUntil)}
                </p>
              </div>

              <button
                style={{ ...styles.button, ...styles.danger }}
                disabled={busy === String(device.id)}
                onClick={() => removeTrustedDevice(device.id)}
              >
                Remove device
              </button>
            </div>
          ))
        )}
      </section>

      {/* LOGIN HISTORY */}
      <section style={styles.panel}>
        <h2 style={styles.heading}>Recent Login Activity</h2>
        <p style={styles.muted}>
          Your latest recorded login attempts.
        </p>

        {loginAttempts.length === 0 ? (
          <p>No login history available.</p>
        ) : (
          loginAttempts.map((log, index) => (
            <div key={log._id || index} style={styles.item}>
              <div>
                <strong
                  style={{
                    color: log.status === "success" ? "#16a36a" : "#e05252",
                  }}
                >
                  {log.status === "success"
                    ? "Successful login"
                    : "Failed login"}
                </strong>

                <p style={styles.muted}>
                  Browser: {log.browser?.name || log.browser || "Unknown"}
                </p>

                <p style={styles.muted}>
                  Device: {log.device?.type || log.device?.model || "Unknown"}
                </p>

                <p style={styles.muted}>
                  IP: {log.ipAddress || "Unavailable"}
                </p>

                <p style={styles.muted}>
                  OTP: {log.otpVerification || "Not available"}
                </p>

                <p style={styles.muted}>
                  Time: {formatDate(log.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </section>

      {/* OTP CHALLENGES */}
      <section style={styles.panel}>
        <h2 style={styles.heading}>OTP Verification Activity</h2>

        {otpChallenges.length === 0 ? (
          <p>No pending OTP challenges.</p>
        ) : (
          otpChallenges.map((challenge, index) => (
            <div key={index} style={styles.item}>
              <div>
                <p>OTP attempts: {challenge.attempts ?? 0}</p>
                <p>OTP sends: {challenge.sendCount ?? 0}</p>
                <p style={styles.muted}>
                  Last sent: {formatDate(challenge.lastSentAt)}
                </p>
                <p style={styles.muted}>
                  Expires: {formatDate(challenge.otpExpiresAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}

export default AccountSecurity;
