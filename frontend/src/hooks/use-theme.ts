"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";

type Theme = "dark" | "light";

export function useTheme(initialTheme?: Theme) {
  // Lazy initializer reads localStorage synchronously on first client render,
  // so theme state is correct from the start and the second effect never
  // overwrites a stored value with the server-supplied initialTheme.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return initialTheme ?? "light";
    const stored = localStorage.getItem("trakk-theme") as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
    return initialTheme ?? "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("trakk-theme", theme);
  }, [theme]);

  // setTheme: update state, persist to localStorage, apply to DOM, fire PATCH (fire-and-forget)
  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
    // DOM and localStorage are updated by the effect above.
    // PATCH is fire-and-forget; failure does not revert UI.
    apiClient
      .patch("/api/v1/auth/me", { themePreference: value })
      .catch(() => {
        // best-effort; failure does not revert UI
      });
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      // PATCH is fire-and-forget; failure does not revert UI
      apiClient
        .patch("/api/v1/auth/me", { themePreference: next })
        .catch(() => {
          // best-effort; failure does not revert UI
        });
      return next;
    });
  }, []);

  return { theme, toggle, setTheme };
}
