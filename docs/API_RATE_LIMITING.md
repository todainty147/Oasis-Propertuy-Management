# API Rate Limiting

OASIS uses a minimal SQL-backed limiter for high-risk Edge/API surfaces. This is intentionally not Redis/KV yet: it is account-aware, auditable, easy to test locally, and sufficient until production traffic proves a lower-latency edge limiter is needed.

## Runtime Objects

- `public.api_rate_limit_events` stores append-only attempts.
- `public.record_api_rate_limit_attempt(...)` records an attempt, returns `allowed`, count/window details, and writes a hosted observability row when a limit is exceeded.
- `supabase/functions/_shared/rateLimit.ts` provides shared Edge Function helpers for identifier hashing, RPC invocation, and stable `429` response bodies.

Blocked responses use:

```json
{
  "ok": false,
  "error": "Too many attempts. Please try again later.",
  "code": "rate_limit_exceeded",
  "retryAfterSeconds": 123
}
```

## Protected Surfaces

| Surface | Scope | Limit |
| --- | --- | --- |
| `invite-user:account` | account | 10 attempts per hour |
| `invite-user:email` | account + target email hash | 3 attempts per hour |
| `send-password-reset-email:email` | target email hash | 5 attempts per hour |
| `send-reminder-emails:account` | account | 1 scheduled run per hour |
| `send-sms-notifications:account` | account | 25 scheduled runs per day |
| `send-sms-notifications:phone` | account + recipient phone hash | 5 sends per hour |
| `ingest-security-observability` | actor + account | 120 events per minute |

Raw email addresses and phone numbers are not stored in the limiter table. Edge Functions hash identifiers before calling the RPC.

## Observability

When a limit is exceeded, `record_api_rate_limit_attempt(...)` inserts a `security_observability_events` row with:

- `category = api_rate_limit`
- `kind = authorization_denied`
- `reason = rate_limit_exceeded`
- `code = 429`
- `guard_denied = true`

The metadata includes only safe operational context such as window size, max attempts, attempt count, retry-after seconds, and limit scope.

## Deployment

Apply the SQL overlay before deploying the protected functions:

```powershell
npm run db:apply:repo -- --db-url "<production database url>"
```

Then redeploy any changed Edge Functions:

```powershell
supabase functions deploy invite-user --project-ref nodpjtkuefcmnxqxjtul
supabase functions deploy send-password-reset-email --project-ref nodpjtkuefcmnxqxjtul
supabase functions deploy send-reminder-emails --project-ref nodpjtkuefcmnxqxjtul
supabase functions deploy send-sms-notifications --project-ref nodpjtkuefcmnxqxjtul
supabase functions deploy ingest-security-observability --project-ref nodpjtkuefcmnxqxjtul
```

No new secrets are required.
