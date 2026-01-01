import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { AccountProvider } from "./context/AccountContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AccountProvider>
        <App />
      </AccountProvider>
    </AuthProvider>
  </React.StrictMode>
);
