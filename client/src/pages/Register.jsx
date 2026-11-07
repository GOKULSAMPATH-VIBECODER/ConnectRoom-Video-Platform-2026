
import { useState } from "react";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(
          data.message || "Registration failed."
        );
      }

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

    } catch (err) {
      setError(
        err.message ||
        "Unable to connect to the backend."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form
        className="login-form"
        onSubmit={handleRegister}
      >
        <h1>Create ConnectRoom Account</h1>

        <label htmlFor="register-name">Name</label>
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        <label htmlFor="register-confirm">
          Confirm Password
        </label>
        <input
          id="register-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) =>
            setConfirmPassword(e.target.value)
          }
          minLength={6}
          required
        />

        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Register"}
        </button>

        <p>
          Already have an account?{" "}
          <a href="/login">Login</a>
        </p>
      </form>
    </main>
  );
}
