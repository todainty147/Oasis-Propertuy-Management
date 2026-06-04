import { admin, HttpError } from "./hmrcEdge.ts";

const CONSENT_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  missing_user_consent: {
    status: 403,
    message: "Explicit landlord consent is required before live HMRC submission.",
  },
  checkbox_confirmed_required: {
    status: 400,
    message: "Confirm the live HMRC submission consent checkbox before continuing.",
  },
  consent_draft_mismatch: {
    status: 403,
    message: "This live HMRC submission consent belongs to a different quarterly draft.",
  },
  stale_user_consent: {
    status: 409,
    message: "The quarterly draft changed after consent was recorded. Review, lock, and consent again.",
  },
  not_permitted: {
    status: 403,
    message: "You do not have permission to submit for this account.",
  },
  quarterly_draft_not_found: {
    status: 404,
    message: "The quarterly draft was not found. It may have been deleted.",
  },
};

export async function assertHmrcLiveSubmissionConsent({
  accountId,
  draftId,
  userId,
  consentId,
}: {
  accountId: string;
  draftId: string;
  userId: string;
  consentId?: string | null;
}) {
  if (!accountId) throw new HttpError("Missing account id.", 400);
  if (!draftId) throw new HttpError("Missing quarterly draft id.", 400);
  if (!userId) throw new HttpError("Missing authenticated user id.", 401);
  if (!consentId) throw consentError("missing_user_consent");

  const { data, error } = await admin.rpc("assert_hmrc_live_submission_consent", {
    p_account_id: accountId,
    p_draft_id: draftId,
    p_consent_id: consentId,
  });

  if (error) {
    const code = extractConsentErrorCode(error);
    throw consentError(code);
  }

  return data as {
    consentId: string;
    accountId: string;
    draftId: string;
    consentedBy: string;
    consentTextVersion: string;
    createdAt: string;
  };
}

function extractConsentErrorCode(error: { message?: string }) {
  const message = String(error?.message || "");
  return Object.keys(CONSENT_ERROR_MESSAGES).find((code) => message.includes(code)) || "missing_user_consent";
}

function consentError(code: string) {
  const resolved = CONSENT_ERROR_MESSAGES[code] || CONSENT_ERROR_MESSAGES.missing_user_consent;
  return new HttpError(resolved.message, resolved.status);
}
