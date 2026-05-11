# Authentication Hardening v1

## Overview

OASIS enforces a strong password policy at the **application layer** (client-side) before any credential reaches Supabase Auth. Supabase Auth policy acts as a second, independent layer. Neither layer alone is sufficient; both must be configured correctly.

---

## Password Policy

### Rules (all must be met)

| Rule | Requirement |
|------|-------------|
| Minimum length | 12 characters |
| Uppercase | At least one uppercase letter (A–Z) |
| Lowercase | At least one lowercase letter (a–z) |
| Number | At least one digit (0–9) |
| Symbol | At least one non-alphanumeric character (`!@#$%…`) |
| Not common | Password is not in the embedded common-password blocklist |
| No repeats | No character repeated 3 or more times consecutively |
| No sequences | No simple keyboard or alphabetical run of 4+ characters (e.g. `1234`, `abcd`, `qwer`) |
| Not personal | Password must not contain the user's email local-part, display name, or account name (checked when context is available) |

### Strength Scoring

A 0–4 score is derived from the proportion of requirements met and is displayed to the user in real time via `PasswordStrengthMeter`:

| Score | Label | Condition |
|-------|-------|-----------|
| 0 | — | Empty |
| 1 | Weak | < 25% requirements met |
| 2 | Fair | 25–49% requirements met |
| 3 | Good | 50–74% requirements met |
| 4 | Strong | 100% requirements met (the only `valid: true` state) |

---

## Where the Policy Is Enforced

| Flow | File | Supabase call protected |
|------|------|------------------------|
| Landlord self-serve signup | `src/pages/LandlordSignup.jsx` | `supabase.auth.signUp` |
| Invite acceptance (staff / tenant / contractor) | `src/pages/Invite.jsx` | `supabase.auth.updateUser` |
| Password reset | `src/pages/ResetPassword.jsx` | `supabase.auth.updateUser` |
| Profile password change | `src/pages/ProfilePage.jsx` | `supabase.auth.updateUser` |

The shared utility is `src/utils/passwordPolicy.js`. The UI component is `src/components/auth/PasswordStrengthMeter.jsx`.

**Login is intentionally excluded.** Existing users must be able to authenticate with their current password regardless of strength. Blocking login would lock out users who created accounts before this policy was introduced. Password strength is only enforced when a password is *created or changed*.

---

## Security Event Logging

When a password is rejected the app logs a `auth_weak_password_rejected` security event via `logSecurityRelevantFailure` in `src/services/securityFailureLogger.js`.

The logged payload includes:

```json
{
  "surface": "auth_weak_password_rejected",
  "flow": "signup | invite_acceptance | reset_password | update_password",
  "failedRequirements": ["minLength", "noCommon"]
}
```

**The password itself, fragments of it, and any PII are never logged.** The `failedRequirements` array contains only the internal requirement key names (e.g. `"minLength"`, `"noCommon"`) which convey no password content.

---

## Supabase Auth Dashboard Configuration

The app-level policy is the first gate, but Supabase Auth should be configured as a second layer for defence-in-depth.

### Required settings (Authentication → Policies in the Supabase Dashboard)

| Setting | Recommended value |
|---------|-------------------|
| Minimum password length | 12 |
| Password strength | Enable "Leaked password protection" (HaveIBeenPwned integration) |
| Email confirmation | Enable for production |

Steps:
1. Go to **Authentication → Providers → Email** in the Supabase Dashboard.
2. Set **Minimum password length** to `12`.
3. Enable **Prevent use of leaked passwords** (uses HIBP API).
4. Ensure **Confirm email** is enabled in production.

> If Supabase Auth rejects a password that the app-side policy accepted (e.g., because HIBP flagged it as leaked), the user will see Supabase's error message. This is expected and correct.

---

## Rollout Approach for Legacy Weak Passwords

Existing users who signed up before this policy was introduced may have passwords that would fail the new rules. The approach is:

1. **No forced immediate logout.** Existing sessions remain valid.
2. **Policy applies on next password change.** The next time a user changes their password (via profile, reset, or invite re-acceptance), the new policy is enforced.
3. **Optional: proactive notification.** A future release can identify accounts with weak passwords (e.g., those that were created before a cutoff date and have not changed their password) and prompt them to update.
4. **Supabase HIBP integration.** Once enabled in the Supabase Dashboard, any password change or reset is checked against the leaked-passwords database regardless of when the account was created.

---

## Implementation Notes

- **No new runtime dependency introduced.** The policy is implemented in ~230 lines of vanilla JS with no imports. Adding `zxcvbn` or similar was considered but rejected: zxcvbn adds ~800 KB and the OASIS policy requirements are well-defined enough to implement natively.
- **Common-password blocklist.** A curated subset of the most common passwords that pass basic character-class checks (12+ chars with mixed classes) is embedded directly in `passwordPolicy.js`. It is not exhaustive; Supabase's HIBP integration covers the long tail.
- **Context-aware checks.** The `noPersonal` requirement is only added to the checklist when calling code passes `email`, `name`, or `accountName` in the `context` parameter. This prevents false positives on flows where the user identity is not yet known.
- **Regression test.** `tests/security/passwordPolicyContracts.test.js` includes a source-code scan that fails if any password-creation page calls `supabase.auth.signUp` or `supabase.auth.updateUser` without also calling `validatePasswordStrength`. This prevents regressions if new auth flows are added.
