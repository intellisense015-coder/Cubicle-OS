"use client";

import { useTheme } from "@/components/theme-provider";
import { LiquidToggle, NimbusToggleIcons } from "@/components/nimbus/liquid-toggle";

// TITLE: THEME TOGGLE
export function ThemeToggle({ variant = "default" }) {
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";
  return (
    <LiquidToggle
      checked={isDarkMode}
      onCheckedChange={(nextTheme) => {
        if (nextTheme !== isDarkMode) toggleTheme();
      }}
      tone={isDarkMode ? "dark" : "light"}
      size={40}
      icons={{ off: NimbusToggleIcons.sun, on: NimbusToggleIcons.moon }}
      label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      className={variant === "segmented" ? "auth-theme-liquid-toggle" : "theme-liquid-toggle"}
    />
  );
}
