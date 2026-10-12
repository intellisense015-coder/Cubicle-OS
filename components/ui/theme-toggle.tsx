"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

// TITLE: THEME TOGGLE
export function ThemeToggle({ variant = "default" }) {
  const { theme, toggleTheme } = useTheme();
  if (variant === "segmented") return <button className="theme-toggle auth-theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}><span className={theme === "light" ? "is-active" : ""}><Sun size={13} />Light</span><span className={theme === "dark" ? "is-active" : ""}><Moon size={13} />Dark</span></button>;
  return <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}<span>{theme === "light" ? "Dark" : "Light"}</span></button>;
}
