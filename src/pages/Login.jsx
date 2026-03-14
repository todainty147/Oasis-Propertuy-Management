import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";

export default function Login() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow"
      >
        <h1 className="text-2xl font-bold mb-4 text-center text-slate-900 dark:text-slate-100">
          {t("login.title")}
        </h1>

        {error && (
          <p className="mb-3 text-sm text-red-600">{error}</p>
        )}

        <input
          type="email"
          placeholder={t("login.email")}
          className="w-full mb-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder={t("login.password")}
          className="w-full mb-4 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
        >
          {loading ? t("login.loggingIn") : t("login.login")}
        </button>

        <div className="mt-4 text-sm text-center">
          <Link to="/reset-password" className="text-slate-600 dark:text-slate-300 hover:underline">
            {t("login.forgotPassword")}
          </Link>
        </div>

        <div className="mt-2 text-sm text-center">
          <Link to="/signup" className="text-blue-700 hover:underline">
            {t("login.createLandlordAccount")}
          </Link>
        </div>
      </form>
    </div>
  );
}
