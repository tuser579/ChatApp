"use client";
import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // ✅ Always start with "dark" on server — no localStorage on server
  const [theme,   setTheme]   = useState("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // ✅ Read localStorage only on client after mount
    const saved = localStorage.getItem("theme") || "dark";
    setTheme(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  function toggleTheme() {
    setTheme(t => t === "dark" ? "light" : "dark");
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}