import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "ledgerly.theme";

function stored(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(stored);
  useEffect(() => {
    applyTheme(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => pref === "system" && applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  return { pref, setPref, cycle: () => setPref(pref === "light" ? "dark" : pref === "dark" ? "system" : "light") };
}

export const initialTheme = () => applyTheme(stored());
