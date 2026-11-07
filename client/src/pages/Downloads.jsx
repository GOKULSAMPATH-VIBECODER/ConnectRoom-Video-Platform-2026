import { useCallback, useEffect, useState } from "react";
import "./Downloads.css";

const API_URL = "http://localhost:5000/api/downloads";

const FILTERS = [
  { label: "All downloads", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "In progress", value: "in_progress" },
  { label: "Failed", value: "failed" },
];

function normalizeStatus(status = "") {
  const value = String(status).toLowerCase().replace(/-/g, "_");

  if (["completed", "complete", "success"].includes(value)) {
    return "completed";
  }

  if (
    ["in_progress", "pending", "processing", "interrupted"].includes(value)
  ) {
    return "in_progress";
  }

  if (["failed", "error"].includes(value)) {
    return "failed";
  }

  return value || "in_progress";
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return (
    date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }) + " IST"
  );
}

function formatSize(bytes) {
  if (bytes == null || bytes === "") return "Size unavailable";

  const value = Number(bytes);

  if (!Number.isFinite(value) || value < 0) {
    return String(bytes);
  }

  if (value === 0) return "0 MB";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );

  return `${(value / 1024 ** index).toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
}

function getDownloadTitle(item) {
  return (
    item.videoTitle ||
    item.title ||
    item.video?.title ||
    item.video?.name ||
    "Untitled video"
  );
}

function getDownloadDate(item) {
  return (
    item.downloadedAt ||
    item.completedAt ||
    item.createdAt ||
    item.updatedAt ||
    null
  );
}

function getDownloadSize(item) {
  return (
    item.fileSize ??
    item.sizeBytes ??
    item.video?.fileSize ??
    item.size ??
    null
  );
}

function getPlan(item) {
  const plan =
    item.plan ||
    item.subscriptionPlan ||
    item.subscription?.plan ||
    "Free";

  return typeof plan === "string"
    ? plan
    : plan?.name || plan?.type || "Free";
}

export default function Downloads() {
  const [downloads, setDownloads] = useState([]);
  const [quota, setQuota] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDownloads = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token =
        localStorage.getItem("token") ||
        localStorage.getItem("authToken");

      if (!token) {
        setError("Please log in to view your downloads.");
        setDownloads([]);
        return;
      }

      const response = await fetch(API_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Your login session is invalid or expired. Please log in again."
        );
      }

      if (!response.ok) {
        throw new Error(`Unable to load downloads (HTTP ${response.status}).`);
      }

      const data = await response.json();

      if (data.success === false) {
        throw new Error(data.message || "Unable to load downloads.");
      }

      const records = Array.isArray(data)
        ? data
        : data.downloads ||
          data.records ||
          data.items ||
          data.data?.downloads ||
          data.data?.records ||
          [];

      if (!Array.isArray(records)) {
        throw new Error("The server returned an unexpected downloads format.");
      }

      setDownloads(records);
      setQuota(data.quota || data.usage || data.data?.quota || null);
    } catch (err) {
      setError(
        err.message ||
          "Could not connect to the server. Check that it is running."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  const filteredDownloads = downloads.filter((item) => {
    const status = normalizeStatus(item.status);

    return filter === "all" || status === filter;
  });

  const completedCount = downloads.filter(
    (item) => normalizeStatus(item.status) === "completed"
  ).length;

  const remainingQuota =
    quota?.remaining ??
    quota?.remainingToday ??
    quota?.remainingDaily ??
    quota?.dailyRemaining;

  return (
    <main className="downloads-page">
      <header className="downloads-header">
        <div>
          <p className="downloads-eyebrow">YOUR LIBRARY</p>
          <h1>My Downloads</h1>
          <p className="downloads-subtitle">
            View and manage your downloaded videos.
          </p>
        </div>

        <button
          className="downloads-refresh"
          onClick={loadDownloads}
          disabled={loading}
          type="button"
        >
          {loading ? "Loading..." : "↻ Refresh"}
        </button>
      </header>

      <section className="downloads-summary">
        <div className="downloads-stat">
          <span>Total downloads</span>
          <strong>{downloads.length}</strong>
        </div>

        <div className="downloads-stat">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>

        <div className="downloads-stat">
          <span>Quota remaining</span>
          <strong>
            {remainingQuota == null ? "—" : remainingQuota}
          </strong>
          <small>
            {remainingQuota == null
              ? "Not provided by the API"
              : "downloads"}
          </small>
        </div>
      </section>

      <nav className="downloads-filters" aria-label="Filter downloads">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={
              filter === item.value
                ? "downloads-filter active"
                : "downloads-filter"
            }
            onClick={() => setFilter(item.value)}
            aria-pressed={filter === item.value}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading && (
        <p className="downloads-message" role="status">
          Loading your downloads...
        </p>
      )}

      {!loading && error && (
        <section className="downloads-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={loadDownloads}>
            Try again
          </button>
        </section>
      )}

      {!loading && !error && filteredDownloads.length === 0 && (
        <section className="downloads-empty">
          <div className="downloads-empty-icon">↓</div>
          <h2>
            {filter === "all"
              ? "No downloads yet"
              : `No ${FILTERS.find((item) => item.value === filter)?.label.toLowerCase()} found`}
          </h2>
          <p>
            {filter === "all"
              ? "Videos you download will appear here."
              : "Try another filter to view your downloads."}
          </p>
        </section>
      )}

      {!loading && !error && filteredDownloads.length > 0 && (
        <section className="downloads-list" aria-label="Your downloads">
          {filteredDownloads.map((item, index) => {
            const status = normalizeStatus(item.status);
            const title = getDownloadTitle(item);
            const thumbnail =
              item.thumbnailUrl ||
              item.thumbnail ||
              item.video?.thumbnailUrl ||
              item.video?.thumbnail ||
              "";

            return (
              <article
                className="download-card"
                key={item._id || item.id || `${title}-${index}`}
              >
                <div className="download-thumbnail">
                  {thumbnail ? (
                    <img src={thumbnail} alt="" loading="lazy" />
                  ) : (
                    <div className="download-placeholder">
                      <span>▶</span>
                    </div>
                  )}
                </div>

                <div className="download-details">
                  <div className="download-title-row">
                    <h2>{title}</h2>

                    <span className={`download-status status-${status}`}>
                      {status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <p className="download-date">
                    Downloaded: {formatDate(getDownloadDate(item))}
                  </p>

                  <div className="download-metadata">
                    <span>Size: {formatSize(getDownloadSize(item))}</span>
                    <span>Plan: {getPlan(item)}</span>
                  </div>

                  {item.progress != null && status === "in_progress" && (
                    <div className="download-progress">
                      <progress
                        value={Math.min(100, Math.max(0, Number(item.progress)))}
                        max="100"
                      />
                      <span>{item.progress}%</span>
                    </div>
                  )}

                  {status === "completed" && (
                    <p className="download-result">✓ Download completed</p>
                  )}

                  {status === "failed" && (
                    <p className="download-failed">
                      Download failed
                      {item.errorMessage ? `: ${item.errorMessage}` : "."}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}