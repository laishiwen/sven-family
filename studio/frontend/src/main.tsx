import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import "./lib/monaco";

// Detect desktop app via user-agent and apply CSS class
if (/Electron/.test(navigator.userAgent)) {
  document.documentElement.classList.add("is-electron");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
