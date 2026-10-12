"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

// TITLE: THEME CONTEXT
const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  // TITLE: APPLY ROOT THEME CLASSES
  const applyTheme = (nextTheme) => {
    const root = document.documentElement;
    root.classList.add("root");
    root.classList.toggle("dark", nextTheme === "dark");
    root.dataset.theme = nextTheme;
  };

  useEffect(() => {
    const stored = window.sessionStorage.getItem("cubicle-theme");
    const nextTheme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => setAppTheme(current === "light" ? "dark" : "light"));
  };

  // TITLE: EXPLICIT THEME SELECTION
  const setAppTheme = (nextTheme) => {
    const normalizedTheme = nextTheme === "dark" ? "dark" : "light";
    window.sessionStorage.setItem("cubicle-theme", normalizedTheme);
    applyTheme(normalizedTheme);
    return normalizedTheme;
  };

  const value = useMemo(() => ({ theme, setTheme: setAppTheme, toggleTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// TITLE: THEME HOOK
export function useTheme() {
  return useContext(ThemeContext);
}
