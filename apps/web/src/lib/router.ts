import { useEffect, useState } from "react";

export type Route =
  | { page: "dashboard" }
  | { page: "invoices"; filter: string | null }
  | { page: "invoice"; id: string | "new" }
  | { page: "clients" }
  | { page: "expenses" }
  | { page: "design" };

/** Hash routes (#/invoices/abc) so the static demo works on GitHub Pages. */
export function parse(hash = location.hash): Route {
  const [path, qs] = hash.replace(/^#\/?/, "").split("?");
  const [a, b] = path.split("/");
  if (a === "invoices" && b) return { page: "invoice", id: decodeURIComponent(b) };
  if (a === "invoices") return { page: "invoices", filter: new URLSearchParams(qs).get("status") };
  if (a === "clients" || a === "expenses" || a === "design") return { page: a };
  return { page: "dashboard" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse());
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      document.querySelector(".content")?.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path: string) => {
  location.hash = path;
};
