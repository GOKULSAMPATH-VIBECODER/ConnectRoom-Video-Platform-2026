import React, { useEffect, useRef, useState } from "react";
import "./VideoPlayer.css";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export default function VideoPlayer({
  src,
  poster,
  title = "ConnectRoom Video",
  autoPlay = false,
  onProgress,
  onNext,
  nextVideo = null,
  initialPosition = 0,
  onPause,
  onEnded,
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const seekRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState("");
  const [theaterMode, setTheaterMode] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);

  // Autoplay countdown state.
  const [countdown, setCountdown] = useState(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const progress =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const remainingTime = Math.max(0, duration - currentTime);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = volume;
    video.muted = muted;
    video.playbackRate = speed;
  }, [volume, muted, speed]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBufferedTime(0);
    setBuffering(false);
    setError("");
    setCaptionsEnabled(false);
    setCountdown(null);
    setAutoplayBlocked(false);

    return () => {
      video.pause();
    };
  }, [src]);

  // Run the autoplay countdown only when a real next video is available.
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      setCountdown(null);
      startNextVideo();
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((previous) =>
        previous === null ? null : previous - 1
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video || !src) return;

    if (video.paused) {
      try {
        setError("");
        setAutoplayBlocked(false);
        await video.play();
      } catch {
        setError("Unable to play this video. Check the video URL and format.");
      }
    } else {
      video.pause();
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);

    if (typeof onProgress === "function") {
      onProgress({
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;

    const actualDuration = Number.isFinite(video.duration)
      ? video.duration
      : 0;

    const requestedPosition = Number.isFinite(initialPosition)
      ? initialPosition
      : 0;

    const restoredPosition = Math.max(
      0,
      Math.min(actualDuration, requestedPosition)
    );

    setDuration(actualDuration);
    video.currentTime = restoredPosition;
    setCurrentTime(restoredPosition);
    setError("");
  }

  function handleProgress() {
    const video = videoRef.current;
    if (!video) return;

    let end = 0;

    try {
      if (video.buffered.length > 0) {
        end = video.buffered.end(video.buffered.length - 1);
      }
    } catch {
      end = 0;
    }

    setBufferedTime(Number.isFinite(end) ? end : 0);
  }

  function handleSeek(event) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;

    const nextTime = Number(event.target.value);

    video.currentTime = Math.max(
      0,
      Math.min(video.duration, nextTime)
    );

    setCurrentTime(video.currentTime);
  }

  function handleVolumeChange(event) {
    const nextVolume = Number(event.target.value);

    setVolume(nextVolume);
    setMuted(nextVolume === 0);

    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextVolume === 0;
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
  }

  function handleSpeedChange(event) {
    const nextSpeed = Number(event.target.value);

    setSpeed(nextSpeed);

    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  }

  async function toggleFullscreen() {
    const player = playerRef.current;
    if (!player) return;

    try {
      if (!document.fullscreenElement) {
        await player.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setError("Fullscreen is not available in this browser.");
    }
  }

  async function togglePictureInPicture() {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (
        document.pictureInPictureEnabled &&
        typeof video.requestPictureInPicture === "function"
      ) {
        await video.requestPictureInPicture();
      } else {
        setError("Picture-in-Picture is not supported in this browser.");
      }
    } catch {
      setError("Unable to activate Picture-in-Picture.");
    }
  }

  function toggleCaptions() {
    const video = videoRef.current;
    if (!video) return;

    const tracks = Array.from(video.textTracks).filter(
      (track) =>
        track.kind === "captions" || track.kind === "subtitles"
    );

    if (tracks.length === 0) {
      setError("No captions or subtitles are available for this video.");
      return;
    }

    const nextEnabled = !captionsEnabled;

    tracks.forEach((track) => {
      track.mode = nextEnabled ? "showing" : "hidden";
    });

    setCaptionsEnabled(nextEnabled);
    setError("");
  }

  function cancelAutoplay() {
    setCountdown(null);
    setAutoplayBlocked(false);
  }

  async function startNextVideo() {
    if (!nextVideo || typeof onNext !== "function") return;

    setCountdown(null);
    setAutoplayBlocked(false);

    // The parent changes the video source. The browser may block
    // automatic playback; in that case, show a manual Play Next button.
    onNext();

    // Actual playback is attempted when the new video can play.
  }

  async function playNextManually() {
    if (!nextVideo || typeof onNext !== "function") return;

    setCountdown(null);
    setAutoplayBlocked(false);
    onNext();
  }

  async function handleCanPlay() {
    setBuffering(false);

    if (autoPlay) {
      try {
        await videoRef.current?.play();
        setAutoplayBlocked(false);
      } catch {
        setAutoplayBlocked(true);
      }
    }
  }

  function handleVideoEnded() {
    const video = videoRef.current;

    setPlaying(false);
    setBuffering(false);

    if (typeof onEnded === "function") {
      onEnded({
        currentTime: video?.currentTime || 0,
        duration:
          video && Number.isFinite(video.duration)
            ? video.duration
            : 0,
      });
    }

    if (nextVideo && typeof onNext === "function") {
      setCountdown(10);
      setAutoplayBlocked(false);
    }
  }

  function handleVideoError() {
    setPlaying(false);
    setBuffering(false);
    setError(
      "Video could not be loaded. Check its URL, format, or access permissions."
    );
  }

  function handleKeyboard(event) {
    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    ) {
      return;
    }

    const video = videoRef.current;
    const key = event.key.toLowerCase();

    if (event.code === "Space" || key === "k") {
      event.preventDefault();
      togglePlay();
    } else if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      video &&
      Number.isFinite(video.duration)
    ) {
      event.preventDefault();

      const interval = event.shiftKey ? 30 : 10;
      const direction = event.key === "ArrowRight" ? 1 : -1;

      video.currentTime = Math.max(
        0,
        Math.min(video.duration, video.currentTime + direction * interval)
      );
    } else if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      video
    ) {
      event.preventDefault();

      const direction = event.key === "ArrowUp" ? 1 : -1;

      const nextVolume = Math.max(
        0,
        Math.min(1, video.volume + direction * 0.05)
      );

      video.volume = nextVolume;
      setVolume(nextVolume);
      video.muted = nextVolume === 0;
      setMuted(nextVolume === 0);
    } else if (key === "m" && video) {
      event.preventDefault();
      toggleMute();
    } else if (key === "f") {
      event.preventDefault();
      toggleFullscreen();
    } else if (key === "t") {
      event.preventDefault();
      setTheaterMode((previous) => !previous);
    } else if (
      key === "p" &&
      video &&
      (document.pictureInPictureEnabled ||
        typeof video.requestPictureInPicture === "function")
    ) {
      event.preventDefault();
      togglePictureInPicture();
    } else if (key === "c" && video) {
      const hasCaptions = Array.from(video.textTracks).some(
        (track) =>
          track.kind === "captions" || track.kind === "subtitles"
      );

      if (hasCaptions) {
        event.preventDefault();
        toggleCaptions();
      }
    } else if (key === "n" && nextVideo && typeof onNext === "function") {
      event.preventDefault();
      playNextManually();
    }
  }

  return (
    <section
      className={`cr-player${theaterMode ? " cr-player-theater" : ""}`}
      ref={playerRef}
      tabIndex={0}
      aria-label={title}
      onKeyDown={handleKeyboard}
    >
      <div className="cr-player-screen">
        <video
          ref={videoRef}
          id="videoPlayer"
          className="cr-player-video"
          src={src || undefined}
          poster={poster}
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
          onPlay={() => {
            setPlaying(true);
            setAutoplayBlocked(false);
          }}
          onPause={() => {
            setPlaying(false);

            if (typeof onPause === "function") {
              const video = videoRef.current;

              onPause({
                currentTime: video?.currentTime || 0,
                duration:
                  video && Number.isFinite(video.duration)
                    ? video.duration
                    : 0,
              });
            }
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onProgress={handleProgress}
          onWaiting={() => setBuffering(true)}
          onCanPlay={handleCanPlay}
          onPlaying={() => setBuffering(false)}
          onEnded={handleVideoEnded}
          onError={handleVideoError}
        />

        {!src && (
          <div className="cr-player-message">
            Add a video URL to start playback.
          </div>
        )}

        {buffering && src && !error && (
          <div className="cr-player-loading" role="status">
            Loading video...
          </div>
        )}

        {error && (
          <div className="cr-player-error" role="alert">
            {error}
          </div>
        )}

        {autoplayBlocked && (
          <div className="cr-player-next-overlay" role="status">
            <p>Browser blocked automatic playback.</p>
            <button type="button" onClick={togglePlay}>
              Play video
            </button>
          </div>
        )}

        {countdown !== null && nextVideo && (
          <div className="cr-player-next-overlay" role="status">
            <h3>Up next: {nextVideo.title || "Next video"}</h3>
            <p>
              Playing next video in{" "}
              <strong>{countdown}</strong> seconds
            </p>

            <div className="cr-player-next-actions">
              <button type="button" onClick={cancelAutoplay}>
                Cancel
              </button>

              <button type="button" onClick={playNextManually}>
                Play Next
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="cr-player-center-button"
          onClick={togglePlay}
          aria-label={playing ? "Pause video" : "Play video"}
          title={playing ? "Pause" : "Play"}
          disabled={!src}
        >
          {playing ? "Ⅱ" : "▶"}
        </button>
      </div>

      <div className="cr-player-controls">
        <input
          ref={seekRef}
          id="timeline"
          className="cr-player-timeline"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          style={{ "--progress": `${progress}%` }}
          onChange={handleSeek}
          disabled={!src || duration <= 0}
          aria-label="Video timeline"
          title="Seek"
        />

        <div className="cr-player-control-row">
          <div className="cr-player-control-group">
            <button
              type="button"
              id="playPause"
              className="cr-player-button"
              onClick={togglePlay}
              disabled={!src}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause (K)" : "Play (K)"}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>

            <button
              type="button"
              id="muteButton"
              className="cr-player-button"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
              title="Mute or unmute (M)"
            >
              {muted || volume === 0
                ? "🔇"
                : volume < 0.5
                  ? "🔉"
                  : "🔊"}
            </button>

            <input
              id="volume"
              className="cr-player-volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume"
              title="Volume"
              style={{
                "--volume-progress": `${(muted ? 0 : volume) * 100}%`,
              }}
            />

            <span className="cr-player-time" aria-live="off">
              {formatTime(currentTime)} / {formatTime(duration)}
              {" · "}
              -{formatTime(remainingTime)} remaining
            </span>
          </div>

          <div className="cr-player-control-group cr-player-right">
            <label className="cr-player-speed-label" htmlFor="speed">
              Speed
            </label>

            <select
              id="speed"
              className="cr-player-speed"
              value={speed}
              onChange={handleSpeedChange}
              aria-label="Playback speed"
              title="Playback speed"
            >
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="1.25">1.25×</option>
              <option value="1.5">1.5×</option>
              <option value="2">2×</option>
            </select>

            <button
              type="button"
              className="cr-player-button"
              onClick={togglePictureInPicture}
              title="Picture-in-Picture (P)"
              aria-label="Picture-in-Picture"
            >
              PiP
            </button>

            <button
              type="button"
              className="cr-player-button"
              onClick={() => setTheaterMode((previous) => !previous)}
              title="Theater mode (T)"
              aria-label="Toggle theater mode"
            >
              Theater
            </button>

            <button
              type="button"
              className="cr-player-button"
              onClick={toggleCaptions}
              title="Captions (C)"
              aria-label="Toggle captions"
            >
              CC
            </button>

            <button
              type="button"
              id="fullscreen"
              className="cr-player-button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              title="Fullscreen (F)"
            >
              ⛶
            </button>
          </div>
        </div>

        <div className="cr-player-time" aria-live="off">
          Buffered to {formatTime(bufferedTime)}
          {" · "}
          Captions: {captionsEnabled ? "On" : "Off"}
        </div>
      </div>
    </section>
  );
}


