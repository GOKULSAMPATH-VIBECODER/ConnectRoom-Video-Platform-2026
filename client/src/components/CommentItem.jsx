

import React, { useEffect, useState } from "react";

const API_BASE = "http://localhost:5000";

export default function CommentItem({
  comment,
  token,
  onRefresh,
  isReply = false,
  preferredLanguage = "en",
}) {
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reaction, setReaction] = useState(null);
  const [likes, setLikes] = useState(comment.likesCount || 0);
  const [dislikes, setDislikes] = useState(comment.dislikesCount || 0);

  const [translation, setTranslation] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [error, setError] = useState("");

  const user = comment.user || {};
  const username = user.name || "ConnectRoom user";
  const initials = username.trim().charAt(0).toUpperCase() || "U";

  const date = comment.createdAt
    ? new Date(comment.createdAt).toLocaleString()
    : "";

  // Clear an old translation when the comment or target language changes.
  useEffect(() => {
    setTranslation("");
    setTranslationError("");
  }, [comment.text, preferredLanguage]);

  async function request(url, options = {}) {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed.");
    }

    return data;
  }

  async function handleReaction(type) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const data = await request(`/api/comments/${comment._id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });

      setLikes(data.likesCount);
      setDislikes(data.dislikesCount);
      setReaction(data.reaction);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReply(event) {
    event.preventDefault();

    if (!replyText.trim() || busy) return;

    setBusy(true);
    setError("");

    try {
      await request(`/api/comments/${comment._id}/replies`, {
        method: "POST",
        body: JSON.stringify({
          text: replyText.trim(),
          language: "auto",
        }),
      });

      setReplyText("");
      setShowReply(false);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTranslate() {
    if (busy) return;

    setBusy(true);
    setTranslationError("");

    try {
      const data = await request(
        `/api/comments/${comment._id}/translate`,
        {
          method: "POST",
          body: JSON.stringify({
            targetLanguage: preferredLanguage,
          }),
        }
      );

      setTranslation(data.translatedText);
    } catch (err) {
      setTranslationError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReport() {
    const reason = window.prompt(
      "Report reason: spam, harassment, hate, misinformation, sexual_content, violence, other",
      "spam"
    );

    if (!reason) return;

    const details =
      window.prompt("Additional details (optional):", "") || "";

    setBusy(true);
    setError("");

    try {
      const data = await request(`/api/comments/${comment._id}/report`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason.trim(),
          details,
        }),
      });

      window.alert(data.message || "Report submitted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`comment-item ${isReply ? "comment-reply" : ""}`}>
      <div className="comment-main">
        {user.profileImage ? (
          <img
            className="comment-avatar"
            src={user.profileImage}
            alt={`${username}'s profile`}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="comment-avatar comment-avatar-fallback">
            {initials}
          </div>
        )}

        <div className="comment-content">
          <div className="comment-header">
            <strong>{username}</strong>
            <span className="comment-date">{date}</span>
            {comment.edited && (
              <span className="comment-edited">Edited</span>
            )}
          </div>

          {user.shareLocation === true && user.location && (
            <div className="comment-location">
              <span aria-hidden="true">📍</span> {user.location}
            </div>
          )}

          {/* Always preserve and display the original comment. */}
          <p className="comment-text">{comment.text}</p>

          {translation && (
            <div className="comment-translation">
              <strong>
                Translation ({preferredLanguage.toUpperCase()})
              </strong>
              <p>{translation}</p>
            </div>
          )}

          {translationError && (
            <div className="comment-error" role="alert">
              <p>{translationError}</p>
              <button
                type="button"
                disabled={busy}
                onClick={handleTranslate}
              >
                Retry translation
              </button>
            </div>
          )}

          <div className="comment-actions">
            <button
              type="button"
              disabled={busy}
              className={reaction === "like" ? "selected" : ""}
              onClick={() => handleReaction("like")}
            >
              👍 {likes}
            </button>

            <button
              type="button"
              disabled={busy}
              className={reaction === "dislike" ? "selected" : ""}
              onClick={() => handleReaction("dislike")}
            >
              👎 {dislikes}
            </button>

            {!isReply && (
              <button
                type="button"
                onClick={() => setShowReply(!showReply)}
              >
                Reply
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={handleTranslate}
            >
              {busy ? "Please wait..." : "Translate"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleReport}
            >
              Report
            </button>
          </div>

          {showReply && (
            <form className="comment-reply-form" onSubmit={handleReply}>
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder="Write a reply..."
                maxLength={5000}
                required
              />

              <button
                type="submit"
                disabled={busy || !replyText.trim()}
              >
                Send reply
              </button>

              <button
                type="button"
                onClick={() => setShowReply(false)}
              >
                Cancel
              </button>
            </form>
          )}

          {error && (
            <p className="comment-error" role="alert">
              {error}
            </p>
          )}

          {comment.replies?.length > 0 && (
            <div className="comment-replies">
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply._id}
                  comment={reply}
                  token={token}
                  onRefresh={onRefresh}
                  isReply
                  preferredLanguage={preferredLanguage}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

