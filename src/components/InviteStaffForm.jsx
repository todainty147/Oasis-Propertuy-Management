// src/components/InviteStaffForm.jsx
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { assertEmail, assertRequiredText } from "../utils/validation";

export default function InviteStaffForm() {
  const { activeAccountId } = useAccount();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInvite(e) {
    e.preventDefault();
    setLoading(true);
    try {
      assertRequiredText(activeAccountId, "Missing accountId");
      const cleanEmail = assertEmail(email, "Valid email required");

      const { error } = await supabase
        .from("account_invitations")
        .insert({
          account_id: activeAccountId,
          email: cleanEmail,
          role: "staff",
          token: crypto.randomUUID(),
        });

      setLoading(false);

      if (error) {
        alert(error.message);
      } else {
        alert(t("inviteStaff.sent"));
        setEmail("");
      }
    } catch (err) {
      setLoading(false);
      alert(err?.message || t("common.error"));
    }
  }

  return (
    <form onSubmit={handleInvite} className="space-y-4">
      <label className="block text-sm font-medium">
        {t("inviteStaff.staffEmail")}
      </label>

      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input"
      />

      <button className="btn" disabled={loading}>
        {t("inviteStaff.sendInvite")}
      </button>
    </form>
  );
}
