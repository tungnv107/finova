"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
const options: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
];

function applyTheme(mode: Theme) {
  document.documentElement.dataset.theme = mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme || "light";
}

function readTheme(): Theme {
  const saved = localStorage.getItem("finova-theme");
  return saved === "light" || saved === "dark" ? saved : "system";
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("finova-theme-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("finova-theme-changed", callback);
  };
}

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, (): Theme => "system");
  useEffect(() => {
    applyTheme(theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if (theme === "system") applyTheme("system"); };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);
  return <div role="group" aria-label="Chế độ giao diện" className={`theme-selector ${compact ? "theme-selector-compact" : ""}`}>{options.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-label={`Giao diện ${label.toLowerCase()}`} aria-pressed={theme === value} title={label} onClick={() => { localStorage.setItem("finova-theme", value); window.dispatchEvent(new Event("finova-theme-changed")); applyTheme(value); }}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>)}</div>;
}
