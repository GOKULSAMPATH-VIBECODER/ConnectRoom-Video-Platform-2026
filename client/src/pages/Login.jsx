
import { useState } from "react";

function getDeviceFingerprint() {
  let fingerprint = localStorage.getItem(
    "connectroomDeviceFingerprint"
  );

  if (!fingerprint) {
    fingerprint =
      `${crypto.randomUUID()}-${crypto.randomUUID()}`;

    localStorage.setItem(
      "connectroomDeviceFingerprint",
      fingerprint
    );
  }

  return fingerprint;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  const [challengeId, setChallengeId] = useState("");
  const [emailMasked, setEmailMasked] = useState("");

  const [otpRequired, setOtpRequired] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function completeLogin(data) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("authToken", data.token);

    if (data.user) {
      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );
    }

    const user = data.user || {};

    const preference = user.themePreference || "dark";
    const mode = user.themeMode || "automatic";

    localStorage.setItem("themePreference", preference);
    localStorage.setItem("themeMode", mode);

    document.documentElement.setAttribute(
      "data-theme",
      preference
    );

    window.location.href = "/account-security";
  }

  async function handleLogin(event) {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const deviceFingerprint = getDeviceFingerprint();

      const response = await fetch(
        "http://localhost:5000/api/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
            deviceFingerprint,
          }),
        }
      );

      const data = await response.json();

      // New device: OTP verification required.
      if (response.status === 202 && data.otpRequired) {
        setChallengeId(data.challengeId);
        setEmailMasked(data.emailMasked || email);
        setOtpRequired(true);

        setMessage(
          data.message ||
          "A verification code has been sent to your email."
        );

        return;
      }

      if (!response.ok || !data.token) {
        throw new Error(data.message || "Login failed.");
      }

      // Trusted device: login successful.
      completeLogin(data);

    } catch (err) {
      setError(
        err.message ||
        "Unable to connect to the backend. Check that the server is running."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the complete six-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const deviceFingerprint = getDeviceFingerprint();

      const response = await fetch(
        "http://localhost:5000/api/login/verify-device",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            challengeId,
            otp,
            deviceFingerprint,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(
          data.message || "OTP verification failed."
        );
      }

      completeLogin(data);

    } catch (err) {
      setError(
        err.message ||
        "Unable to verify the device. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function backToLogin() {
    setOtpRequired(false);
    setChallengeId("");
    setOtp("");
    setError("");
    setMessage("");
  }

  return (
    <main className="login-page">
      <form
        className="login-form"
        onSubmit={otpRequired ? handleVerifyOtp : handleLogin}
      >
        <h1>ConnectRoom Login</h1>

        {!otpRequired ? (
          <>
            <label htmlFor="login-email">Email</label>

            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
            />

            <label htmlFor="login-password">Password</label>

            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
            />

            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </>
        ) : (
          <>
            <h2>Verify Your Device</h2>

            <p>
              A six-digit verification code was sent to:
            </p>

            <strong>{emailMasked}</strong>

            <label htmlFor="login-otp">
              Verification Code
            </label>

            <input
              id="login-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(event) =>
                setOtp(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify & Login"}
            </button>

            <button
              type="button"
              onClick={backToLogin}
              disabled={loading}
            >
              Back to Login
            </button>
          </>
        )}

        {message && (
          <p role="status" className="login-success">
            {message}
          </p>
        )}

        {error && otpRequired && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}

