// src/components/InviteStaffForm.jsx
import { useState } from "react";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { assertEmail, assertRequiredText } from "../utils/validation";
import { createAccountInvitation } from "../services/invitationService";

export default function InviteStaffForm() {
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInvite(e) {
    e.preventDefault();
    setLoading(true);
    try {
      assertRequiredText(activeAccountId, "Missing accountId");
      const cleanEmail = assertEmail(email, "Valid email required");

      await createAccountInvitation({
        accountId: activeAccountId,
        email: cleanEmail,
        role: "staff",
        inviterRole: activeRole,
      });

      setLoading(false);
      alert(t("inviteStaff.sent"));
      setEmail("");
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
