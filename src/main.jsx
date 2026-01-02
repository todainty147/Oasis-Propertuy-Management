import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import { AuthProvider } from "./context/AuthContext";
import { AccountProvider } from "./context/AccountContext";
import { TenantProvider } from "./context/TenantContext";

import "./index.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AccountProvider>
        <TenantProvider>

          <App />

        </TenantProvider>
      </AccountProvider>
    </AuthProvider>
  </React.StrictMode>
);
