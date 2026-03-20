import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

/**
 * Supports three modes: "light" | "dark" | "system"
 * Applies data-theme="light" or data-theme="dark" to <html> so CSS can react.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("lp-theme") || "system";
    } catch {
      return "system";
    }
  });

  // Resolve system preference
  const getResolved = (t) => {
    if (t !== "system") return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  useEffect(() => {
    // Persist
    try { localStorage.setItem("lp-theme", theme); } catch {}

    // Apply to <html>
    const resolved = getResolved(theme);
    document.documentElement.setAttribute("data-theme", resolved);

    // If system, watch for media changes while this mode is active
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e) => {
        document.documentElement.setAttribute(
          "data-theme",
          e.matches ? "dark" : "light"
        );
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  // Kept for backward-compat; new code should use setTheme directly
  const toggleTheme = () =>
    setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "light", setTheme: () => {}, toggleTheme: () => {} };
  return ctx;
}
