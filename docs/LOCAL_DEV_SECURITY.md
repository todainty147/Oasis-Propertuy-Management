# Local Development Security

This note defines the safe default for OASIS local development and preview servers.

## Dev Server Exposure

The root Vite app binds development and preview servers to `127.0.0.1` in [vite.config.js](/mnt/c/Users/Home/oasisrentalmanagementapp/vite.config.js). Keep that default unless there is a specific, approved reason to test from another device.

Do not expose local dev servers through ngrok, Cloudflare Tunnel, Tailscale Funnel, port-forwarding, public Wi-Fi bind addresses, or similar tunnels unless all of the following are true:

- the test requires external access and cannot be done through a deployed staging environment
- the tunnel is time-boxed and removed immediately after testing
- access is protected by authentication or a provider access policy
- local `.env` values point only to local or non-production resources
- no service-role keys, production database URLs, provider API keys, or customer data are available to the exposed process

If tunnel testing is required, prefer a disposable staging deployment with explicit `ALLOWED_APP_ORIGINS` instead of exposing a developer workstation.

## Environment Files

Local secret handling rules:

- `.env`, `.env.*`, and `*.local` are ignored by git.
- `.env.example`, `.env.integration.example`, and `.env.staging.example` must contain placeholders or local-only values.
- Never copy production/staging service-role keys into root `.env` files used by `npm run dev`.
- Keep browser-exposed values limited to `VITE_*` public client configuration.
- Rotate any key that was committed, pasted into a ticket, or used during an exposed tunnel test.

Supabase anon keys are browser-facing credentials, but examples should still avoid live hosted project identifiers. Use local Supabase values for local development, and keep hosted project values in deployment provider environment settings.

## Verification

Safe defaults to verify before local work:

```bash
npm run dev
```

The Vite output should advertise a local URL only, such as `http://127.0.0.1:5173/` or `http://localhost:5173/`.

Do not run Vite with `--host 0.0.0.0` or `--host true` for normal OASIS development.
