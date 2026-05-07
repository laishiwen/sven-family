import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";
import { useThemeStore, applyTheme } from "./stores/themeStore";

// Apply stored theme on load
const stored = JSON.parse(localStorage.getItem("sven-theme") || "{}");
applyTheme(stored?.state?.theme || "system");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
