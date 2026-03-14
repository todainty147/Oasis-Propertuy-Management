import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { finalizeSelfServeLandlordAccount } from "../services/selfServeSignupService";

export default function LandlordSignup() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanName = String(accountName || "").trim();
      if (!cleanEmail || !password || !cleanName) {
        throw new Error(t("signup.required"));
      }

      const { error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            signup_intent: "landlord_owner",
            signup_account_name: cleanName,
          },
        },
      });

      if (signUpErr) throw signUpErr;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      // If auth is instantly signed in (email confirm off), create account immediately.
      if (session?.user) {
        const row = await finalizeSelfServeLandlordAccount(cleanName);
        const accountId = row?.account_id;
        if (accountId) localStorage.setItem("activeAccountId", accountId);
        navigate("/dashboard", { replace: true });
        return;
      }

      // Email confirm on: account will be created on first login by AccountContext.
      setMessage(t("signup.verifyEmail"));
      setPassword("");
    } catch (e2) {
      setError(e2?.message || t("signup.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white p-6 rounded-xl shadow space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-center">{t("signup.title")}</h1>
          <p className="text-sm text-slate-600 text-center">{t("signup.subtitle")}</p>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

        <input
          type="text"
          placeholder={t("signup.accountName")}
          className="w-full border rounded-lg px-3 py-2"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <input
          type="email"
          placeholder={t("login.email")}
          className="w-full border rounded-lg px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder={t("login.password")}
          className="w-full border rounded-lg px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
        >
          {loading ? t("signup.creating") : t("signup.createLandlord")}
        </button>

        <div className="text-xs text-slate-500">
          {t("signup.inviteOnlyHint")}
        </div>

        <div className="text-sm text-center">
          <Link to="/login" className="text-blue-700 hover:underline">
            {t("signup.haveAccount")}
          </Link>
        </div>
      </form>
    </div>
  );
}

