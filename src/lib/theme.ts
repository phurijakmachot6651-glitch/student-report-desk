import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/**
 * Inline script injected into <head> before hydration so the correct theme
 * class is applied on first paint — avoids a light/dark flash on load.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;var d=t?t==="dark":m;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/**
 * Reads/writes the active theme, keeping the <html> class and localStorage in
 * sync.
 *
 * State starts at "light" so the first client render matches the server (which
 * always renders "light"), avoiding a hydration mismatch. After mount we sync
 * from the class the no-flash script already applied, without writing back.
 * Only user-driven changes touch the DOM and localStorage.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setThemeState(isDark ? "dark" : "light");
    setMounted(true);
  }, []);

  const applyTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private mode, quota)
    }
  };

  const toggleTheme = () => applyTheme(theme === "dark" ? "light" : "dark");

  return { theme, setTheme: applyTheme, toggleTheme, mounted };
}
