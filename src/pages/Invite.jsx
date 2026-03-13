import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";

export default function Invite() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");

  async function acceptInvite() {
    const { error } = await supabase.rpc(
      "accept_account_invite",
      { invite_token: token }
    );

    if (!error) navigate("/dashboard");
    else alert(error.message);
  }

  async function sendMagicLink() {
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/invite?token=${token}`,
      },
    });
  }

  if (loading) return null;

  return (
    <div className="max-w-md mx-auto mt-24 space-y-4">
      {!user ? (
        <>
          <h1>{t("invite.invited")}</h1>
          <input
            type="email"
            placeholder={t("invite.workEmail")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={sendMagicLink}>
            {t("invite.continueWithEmail")}
          </button>
        </>
      ) : (
        <>
          <h1>{t("invite.joinWorkspace")}</h1>
          <button onClick={acceptInvite}>
            {t("invite.acceptInvitation")}
          </button>
        </>
      )}
    </div>
  );
}
