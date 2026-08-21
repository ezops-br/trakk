import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        trakk: {
          teal:             "var(--trakk-teal)",
          blue:             "var(--trakk-blue)",
          cyan:             "var(--trakk-cyan)",
          bg:               "var(--trakk-bg)",
          surface:          "var(--trakk-surface)",
          "surface-alt":    "var(--trakk-surface-alt)",
          border:           "var(--trakk-border)",
          text:             "var(--trakk-text)",
          "text-secondary": "var(--trakk-text-secondary)",
          "text-strong":    "var(--trakk-text-strong)",
          "text-dim":       "var(--trakk-text-dim)",
        },
        priority: {
          urgent: "var(--trakk-urgent)",
          high:   "var(--trakk-high)",
          medium: "var(--trakk-medium)",
          low:    "var(--trakk-low)",
          none:   "var(--trakk-none)",
        },
        status: {
          success: "var(--trakk-success)",
          error:   "var(--trakk-error)",
          warning: "var(--trakk-warning)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body:    ["var(--font-body)"],
        mono:    ["var(--font-mono)"],
      },
      borderRadius: {
        card:    "12px",
        badge:   "4px",
        panel:   "10px",
        callout: "6px",
      },
      boxShadow: {
        glow:         "var(--trakk-glow)",
        "glow-subtle": "var(--trakk-glow-subtle)",
        card:         "var(--trakk-shadow)",
      },
      backgroundImage: {
        "gradient-brand":     "var(--trakk-gradient)",
        "gradient-brand-rev": "var(--trakk-gradient-rev)",
      },
      transitionTimingFunction: {
        "ace-enter": "cubic-bezier(0.16, 1, 0.3, 1)",
        "ace-exit":  "cubic-bezier(0.7, 0, 0.84, 0)",
        "ace-smooth":"cubic-bezier(0.45, 0, 0.55, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
