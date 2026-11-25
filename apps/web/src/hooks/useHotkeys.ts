import { useEffect, useRef } from "react";

type Map = Record<string, (e: KeyboardEvent) => void>;

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Keys like "mod+k", "n", "/", "escape". Single keys are ignored while typing in a field. */
export function useHotkeys(map: Map) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const combo = (e.metaKey || e.ctrlKey ? "mod+" : "") + key;
      const handler = ref.current[combo] ?? (!e.metaKey && !e.ctrlKey && !e.altKey ? ref.current[key] : undefined);
      if (!handler) return;
      if (!combo.startsWith("mod+") && key !== "escape" && typing(e.target)) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}
