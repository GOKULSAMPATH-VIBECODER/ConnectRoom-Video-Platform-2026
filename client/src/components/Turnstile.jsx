import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export default function Turnstile({ onVerify }) {
  const containerRef = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) {
      console.error("VITE_TURNSTILE_SITE_KEY is missing.");
      return;
    }

    let cancelled = false;

    function renderWidget() {
      if (
        cancelled ||
        !containerRef.current ||
        !window.turnstile
      ) return;

      containerRef.current.innerHTML = "";

      widgetId.current = window.turnstile.render(
        containerRef.current,
        {
          sitekey: SITE_KEY,
          callback: onVerify,
          "expired-callback": () => onVerify(""),
          "error-callback": () => onVerify(""),
        }
      );
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      let script = document.querySelector(
        'script[src*="turnstile/v0/api.js"]'
      );

      if (!script) {
        script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      script.addEventListener("load", renderWidget);
    }

    return () => {
      cancelled = true;

      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
      }
    };
  }, [onVerify]);

  return (
    <div>
      {!SITE_KEY && (
        <p style={{ color: "red" }}>
          CAPTCHA site key is missing from client/.env
        </p>
      )}
      <div ref={containerRef} />
    </div>
  );
}