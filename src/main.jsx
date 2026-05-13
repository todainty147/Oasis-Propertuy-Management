// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { AccountProvider } from "./context/AccountContext";
import { TenantProvider } from "./context/TenantContext";
import { I18nProvider } from "./context/I18nContext";
import { ThemeProvider } from "./context/ThemeContext";

import "./index.css";

// Register service worker for PWA (offline fallback, push notifications)
// Only in production — keeps dev experience unaffected by caching
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[SW] Registration failed:", err);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <I18nProvider>
            <AccountProvider>
              <TenantProvider>
                <App />
              </TenantProvider>
            </AccountProvider>
          </I18nProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
