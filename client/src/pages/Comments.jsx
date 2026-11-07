
import React, { useCallback, useEffect, useState } from "react";
import CommentItem from "../components/CommentItem";
import Turnstile from "../components/Turnstile";

const API_BASE = "http://localhost:5000";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ta", name: "Tamil" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "kn", name: "Kannada" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
];

export default function Comments({ videoId }) {
  const [token] = useState(
    () =>
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      ""
  );

  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);

  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [languageLoading, setLanguageLoading] = useState(true);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [languageError, setLanguageError] = useState("");

  const loadComments = useCallback(async () => {
    if (!token || !videoId) {
      setLoading(false);
      return;
    }

    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/videos/${videoId}/comments?page=1&limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load comments.");
      }

      setComments(data.comments || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, videoId]);

  const loadPreferredLanguage = useCallback(async () => {
    if (!token) {
      setLanguageLoading(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/me/translation-language`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load preferred language.");
      }

      setPreferredLanguage(data.preferredLanguage || "en");
    } catch (err) {
      setLanguageError(err.message);
    } finally {
      setLanguageLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    loadPreferredLanguage();
  }, [loadPreferredLanguage]);

  async function handleLanguageChange(event) {
    const newLanguage = event.target.value;
    setLanguageSaving(true);
    setLanguageError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/me/translation-language`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ preferredLanguage: newLanguage }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not save preferred language.");
      }

      setPreferredLanguage(data.preferredLanguage || newLanguage);
    } catch (err) {
      setLanguageError(err.message);
    } finally {
      setLanguageSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!text.trim() || posting) return;

    if (captchaRequired && !captchaToken) {
      setError("Please complete the CAPTCHA first.");
      return;
    }

    setPosting(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE}/api/videos/${videoId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: text.trim(),
            language: "auto",
            ...(captchaToken && { captchaToken }),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.captchaRequired) {
          setCaptchaRequired(true);
          setCaptchaToken("");
        }
        throw new Error(data.message || "Could not post comment.");
      }

      setText("");
      setCaptchaRequired(false);
      setCaptchaToken("");
      await loadComments();
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  if (!token) {
    return (
      <section className="comments-section">
        <h2>Comments</h2>
        <p>Please log in to view and post comments.</p>
      </section>
    );
  }

  return (
    <section className="comments-section">
      <h2>Comments ({total})</h2>

      <div className="comment-language-preference">
        <label htmlFor="comment-translation-language">
          Preferred translation language:
        </label>

        <select
          id="comment-translation-language"
          value={preferredLanguage}
          onChange={handleLanguageChange}
          disabled={languageLoading || languageSaving}
        >
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>

        {languageSaving && <span>Saving...</span>}
      </div>

      {languageError && (
        <p className="comment-error" role="alert">{languageError}</p>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a comment..."
          maxLength={5000}
          required
        />

        {captchaRequired && (
          <Turnstile
            onVerify={(value) => {
              setCaptchaToken(value);
              setError("");
            }}
          />
        )}

        <div className="comment-form-footer">
          <span>{text.length}/5000</span>
          <button
            type="submit"
            disabled={posting || !text.trim() || (captchaRequired && !captchaToken)}
          >
            {posting ? "Posting..." : "Post comment"}
          </button>
        </div>
      </form>

      {error && (
        <p className="comment-error" role="alert">{error}</p>
      )}

      {loading ? (
        <p>Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="no-comments">
          No comments yet. Be the first to comment!
        </p>
      ) : (
        <div className="comments-list">
          {comments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              token={token}
              onRefresh={loadComments}
              preferredLanguage={preferredLanguage}
            />
          ))}
        </div>
      )}
    </section>
  );
}

