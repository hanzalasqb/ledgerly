import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initialTheme } from "./hooks/useTheme";
import "./styles/tokens.css";
import "./styles/app.css";

initialTheme();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
