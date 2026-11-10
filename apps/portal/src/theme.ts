import { useEffect } from "react";
import { usePref } from "./prefs";

/** "system" follows the device's light/dark setting. */
export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/**
 * The app's theme, picked in the account menu and remembered in this
 * browser. It's applied as data-theme on <html>, which the color tokens in
 * styles.css follow. index.html applies it before the first paint, so the
 * page never flashes the wrong one; this keeps it in step after a change.
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = usePref<Theme>("theme", "system", isTheme);
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme];
}
