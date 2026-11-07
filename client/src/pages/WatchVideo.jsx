import React, { useCallback, useEffect, useRef, useState } from "react";
import VideoPlayer from "../components/VideoPlayer";
import Comments from "./Comments";

const API_BASE = "http://localhost:5000";
const SAMPLE_VIDEO = {
  id: "6ae1c393956556e4554eee14",
  src: "/videos/sample.mp4",
  title: "ConnectRoom Sample Video",
  poster: undefined,
};

// Add a real next video here when your video-listing API is connected.
// Example:
// const NEXT_VIDEO = {
//   id: "YOUR_NEXT_VIDEO_ID",
//   src: "/videos/next-video.mp4",
//   title: "Next Video",
// };
const NEXT_VIDEO = null;

const COMPLETION_THRESHOLD = 0.9;

export default function WatchVideo() {
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savedProgress, setSavedProgress] = useState(null);
  const [canWatch, setCanWatch] = useState(false);
  const [startPosition, setStartPosition] = useState(0);
  const [currentVideo, setCurrentVideo] = useState(SAMPLE_VIDEO);
  const [completionMessage, setCompletionMessage] = useState("");

  const lastSaveTime = useRef(0);
  const completionSaved = useRef(false);

  useEffect(() => {
    const storedToken =
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      "";

    setToken(storedToken);

    if (!storedToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadProgress() {
      try {
        const response = await fetch(
          `${API_BASE}/api/watch-progress/${SAMPLE_VIDEO.id}`,
          {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Could not load watch progress."
          );
        }

        if (cancelled) return;

        const progress = data.progress;
        setSavedProgress(progress);

        if (
          progress &&
          !progress.completed &&
          Number(progress.positionSeconds) > 5
        ) {
          setStartPosition(Number(progress.positionSeconds));
          setCanWatch(false);
        } else {
          setStartPosition(0);
          setCanWatch(true);
        }

        if (progress?.completed) {
          setCompletionMessage("You have already completed this video.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load watch progress.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProgress();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveProgress = useCallback(
    async (progress, force = false, completed = false) => {
      if (!token) return;

      const currentTime = Number(progress?.currentTime);
      const duration = Number(progress?.duration);

      if (
        !Number.isFinite(currentTime) ||
        currentTime < 0 ||
        !Number.isFinite(duration) ||
        duration <= 0
      ) {
        return;
      }

      const reachedThreshold =
        currentTime / duration >= COMPLETION_THRESHOLD;

      const isCompleted =
        completed ||
        reachedThreshold ||
        completionSaved.current ||
        Boolean(savedProgress?.completed);

      const now = Date.now();

      if (
        !force &&
        !isCompleted &&
        now - lastSaveTime.current < 12000
      ) {
        return;
      }

      lastSaveTime.current = now;

      if (isCompleted) {
        completionSaved.current = true;
      }

      try {
        const response = await fetch(
          `${API_BASE}/api/watch-progress/${currentVideo.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              positionSeconds: currentTime,
              durationSeconds: duration,
              completed: isCompleted,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Could not save watch progress."
          );
        }

        setSavedProgress(
          data.progress || {
            positionSeconds: currentTime,
            durationSeconds: duration,
            completed: isCompleted,
          }
        );

        if (isCompleted) {
          setCompletionMessage("Video completed!");
        }
      } catch (err) {
        if (isCompleted) {
          completionSaved.current = false;
        }

        console.error(
          "Watch progress save failed:",
          err.message
        );
      }
    },
    [token, currentVideo.id, savedProgress]
  );

  function chooseResume() {
    setStartPosition(
      Number(savedProgress?.positionSeconds) || 0
    );
    setCanWatch(true);
  }

  function chooseRestart() {
    completionSaved.current = false;
    setCompletionMessage("");
    setStartPosition(0);
    setCanWatch(true);
  }

  function handleNextVideo() {
    if (!NEXT_VIDEO) return;

    completionSaved.current = false;
    lastSaveTime.current = 0;
    setSavedProgress(null);
    setCompletionMessage("");
    setCurrentVideo(NEXT_VIDEO);
    setStartPosition(0);
    setAutoPlayNext(true);
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        Loading saved watch progress...
      </main>
    );
  }

  if (!token) {
    return (
      <main style={pageStyle}>
        <h1>Login required</h1>
        <p>Log in to save and restore your watch progress.</p>
        <a href="/login" style={{ color: "#8ab4ff" }}>
          Go to Login
        </a>
      </main>
    );
  }

  if (error) {
    return (
      <main style={pageStyle}>
        <h1>Watch Video</h1>
        <p role="alert">{error}</p>
        <button onClick={() => window.location.reload()}>
          Try again
        </button>
      </main>
    );
  }

  const hasResumePoint =
    currentVideo.id === SAMPLE_VIDEO.id &&
    savedProgress &&
    !savedProgress.completed &&
    Number(savedProgress.positionSeconds) > 5;

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <h1 style={{ marginBottom: 24 }}>Watch Video</h1>

        {!canWatch && hasResumePoint && (
          <section style={panelStyle}>
            <h2>Continue watching?</h2>

            <p>
              Saved position:{" "}
              {Math.floor(savedProgress.positionSeconds / 60)}:
              {String(
                Math.floor(savedProgress.positionSeconds % 60)
              ).padStart(2, "0")}
            </p>

            <div style={buttonRowStyle}>
              <button onClick={chooseResume} style={buttonStyle}>
                Resume
              </button>

              <button onClick={chooseRestart} style={buttonStyle}>
                Restart
              </button>
            </div>
          </section>
        )}

        {canWatch && (
          <VideoPlayer
            key={`${currentVideo.id}-${startPosition}`}
            src={currentVideo.src}
            title={currentVideo.title}
            poster={currentVideo.poster}
            initialPosition={startPosition}
            nextVideo={NEXT_VIDEO}
            onNext={handleNextVideo}
                        onProgress={(progress) => {
              saveProgress(progress, false, false);
            }}
            onPause={(progress) => {             
              saveProgress(progress, true, false);
            }}
            onEnded={(progress) => {
              saveProgress(progress, true, true);
            }}
          />
        )}
             <Comments videoId={currentVideo.id} />

        {completionMessage && (
          <p
            role="status"
            style={{
              color: "#8ee6a1",
              marginTop: 16,
              fontWeight: 600,
            }}
          >
            {completionMessage}
          </p>
        )}

        <p style={{ color: "#aab0bd", marginTop: 16 }}>
          Your watch progress is saved to your account.
          A video is marked completed after 90% has been watched.
        </p>

        {!NEXT_VIDEO && (
          <p style={{ color: "#aab0bd", marginTop: 8 }}>
            No next video is currently available for autoplay.
          </p>
        )}
      </div>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#0f1117",
  color: "#ffffff",
  padding: "32px 20px",
  boxSizing: "border-box",
};

const panelStyle = {
  background: "#191d27",
  padding: 20,
  borderRadius: 10,
  marginBottom: 20,
};

const buttonRowStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const buttonStyle = {
  padding: "10px 18px",
  cursor: "pointer",
};