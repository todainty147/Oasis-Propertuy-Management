# Secret Hygiene

Local environment files are for developer machines only. They must never be
committed, pasted into tickets, prompts, screenshots, logs, or PR comments.

The repo intentionally ignores `.env`, `.env.*`, and `*.local`. Only
`.env.example` files may be committed, and they must contain placeholder values
only.

## Required Practices

- Store Supabase, Stripe, OpenAI, Anthropic, HMRC, and webhook secrets in the
  Supabase dashboard, GitHub Actions secrets, or another approved secret store.
- Keep local `.env` files out of Git and out of shared artifacts.
- Use placeholders such as `your_key_here`, `REDACTED`, or `placeholder` in
  documentation and examples.
- Rotate any Supabase service-role key that appears in a local file which may
  have been shared, copied, logged, screenshotted, or exposed to a prompt.
- After rotation, verify staging and production use the new keys and that old
  keys no longer work.
- Never print service-role keys or other long-lived secrets from scripts.

## Manual Follow-Up For This Repository

Real-looking Supabase keys were found in ignored local env files during audit.
They were not committed by Git, but they should still be treated as sensitive.

Recommended manual actions:

1. Rotate any real service-role keys present in local env files.
2. Verify staging and production environment variables after rotation.
3. Confirm no logs, screenshots, tickets, chat prompts, or shell transcripts
   contain the old values.
4. Re-run the repo secret scanner before pushing changes:

```sh
npm run security:secrets
```
