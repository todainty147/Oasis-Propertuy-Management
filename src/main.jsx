// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { AccountProvider } from "./context/AccountContext";
import { TenantProvider } from "./context/TenantContext";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AccountProvider>
          <TenantProvider>
            <App />
          </TenantProvider>
        </AccountProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
