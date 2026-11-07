import Register from "./pages/Register";
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Downloads from "./pages/Downloads";
import Plans from "./pages/Plans";
import WatchVideo from "./pages/WatchVideo";
import Login from "./pages/Login";
import AdminModeration from "./pages/AdminModeration";
import AccountSecurity from "./pages/AccountSecurity";
function App() {
  const [theme, setTheme] = useState(
    localStorage.getItem("themePreference") || "dark"
  );

  const [themeMode, setThemeMode] = useState(
    localStorage.getItem("themeMode") || "automatic"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("themePreference", theme);
    localStorage.setItem("themeMode", themeMode);
  }, [theme, themeMode]);

  async function updateTheme(mode, preference) {
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("authToken");

    if (!token) {
      setTheme(mode === "automatic" ? "dark" : preference);
      setThemeMode(mode);
      return;
    }

    try {
      const response = await fetch("http://localhost:5000/api/theme", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          themeMode: mode,
          ...(mode === "manual" && {
            themePreference: preference,
          }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Theme update failed");
      }

      const user = data.user || data;

      setTheme(user.themePreference || preference || "dark");
      setThemeMode(user.themeMode || mode);
    } catch (error) {
      console.error("Theme update error:", error);
      alert(error.message);
    }
  }

  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="theme-header">
          <h2 className="app-logo">ConnectRoom</h2>

          <div className="theme-controls">
            <button
              onClick={() => updateTheme("manual", "light")}
              className={themeMode === "manual" && theme === "light" ? "active" : ""}
            >
              ☀ Light
            </button>

            <button
              onClick={() => updateTheme("manual", "dark")}
              className={themeMode === "manual" && theme === "dark" ? "active" : ""}
            >
              ☾ Dark
            </button>

            <button
              onClick={() => updateTheme("automatic")}
              className={themeMode === "automatic" ? "active" : ""}
            >
              ⚙ Automatic
            </button>
          </div>
        </header>

        <Routes>
          <Route path="/admin/moderation" element={<AdminModeration />} />
          <Route path="/register" element={<Register />} />
          <Route path="/account-security" element={<AccountSecurity />} />
          <Route path="/login" element={<Login />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/watch-video" element={<WatchVideo />} />
          <Route path="/" element={<Navigate to="/downloads" replace />} />
          <Route path="*" element={<Navigate to="/downloads" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
