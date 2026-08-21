"use client";

import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ initialTheme }: { initialTheme?: "light" | "dark" }) {
  const { theme, toggle } = useTheme(initialTheme);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="rounded-md p-2 text-trakk-text-secondary transition-colors duration-200 hover:bg-[var(--trakk-teal-hover)] hover:text-trakk-teal"
    >
      {theme === "light" ? (
        <Moon size={20} strokeWidth={1.75} data-testid="moon-icon" />
      ) : (
        <Sun size={20} strokeWidth={1.75} data-testid="sun-icon" />
      )}
    </button>
  );
}
