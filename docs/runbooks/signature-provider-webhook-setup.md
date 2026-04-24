# Signature Provider Webhook Setup

## Purpose

Use this runbook when connecting a signature provider to OASIS agreement packets for the first time, or when webhook delivery stops working after a credential, domain, or deployment change.

This runbook is written for:

- the product owner
- future support team members
- engineers validating a new environment

The current live implementation in the repo is **DocuSeal-first**.

## Current OASIS Signature Runtime

OASIS currently uses two Edge Functions for the DocuSeal flow:

1. [create-signature-packet/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/create-signature-packet/index.ts)
2. [handle-signature-webhook/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/handle-signature-webhook/index.ts)

What they do:

- `create-signature-packet`
  - prepares a packet for signature
  - creates a DocuSeal submission
  - records the submission id in OASIS
  - stores the signer URL for the tenant or contractor

- `handle-signature-webhook`
  - accepts webhook callbacks from the provider
  - verifies the shared secret
  - resolves the OASIS packet id and submission id
  - syncs packet signature status
  - imports the signed PDF into OASIS when the provider reports completion

## Required Deployments Before Webhook Setup

Make sure these have already been deployed:

```bash
supabase functions deploy create-signature-packet --project-ref nodpjtkuefcmnxqxjtul
supabase functions deploy handle-signature-webhook --project-ref nodpjtkuefcmnxqxjtul
```

Make sure these SQL overlays are already applied:

- [document_signature_docuseal.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_signature_docuseal.sql)
- [auth_user_profile_bootstrap_hardening.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/auth_user_profile_bootstrap_hardening.sql) if you are bringing a full recent production rollout in line

## Required Secrets

### Supabase Edge Function secrets

The signature functions rely on these environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `ALLOWED_APP_ORIGINS`
- `DOCUSEAL_API_KEY`
- `DOCUSEAL_API_BASE_URL`
- `DOCUSEAL_WEBHOOK_SECRET`

Repo proof:

- [create-signature-packet/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/create-signature-packet/index.ts)
- [handle-signature-webhook/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/handle-signature-webhook/index.ts)

### Notes on each secret

- `DOCUSEAL_API_KEY`
  - authenticates OASIS to the DocuSeal API
  - used when creating submissions and downloading final signed documents

- `DOCUSEAL_API_BASE_URL`
  - defaults to `https://api.docuseal.com`
  - override only if using a self-hosted DocuSeal deployment or a different provider-compatible base URL

- `DOCUSEAL_WEBHOOK_SECRET`
  - shared secret OASIS expects on incoming webhook calls
  - this is required by the webhook function
  - webhook requests without the expected secret are rejected with `401 Unauthorized webhook`

## Account-Level App Configuration

The provider settings row lives in:

- `public.document_signature_provider_settings`

Inspect it with:

```sql
select account_id, provider, provider_base_url, default_signature_template_id,
       is_enabled, webhook_configured, configured_by, configured_at, updated_at
from public.document_signature_provider_settings
where account_id = '<account_id>';
```

For DocuSeal, expected values are usually:

- `provider = 'docuseal'`
- `provider_base_url = 'https://api.docuseal.com'` unless self-hosted
- `default_signature_template_id` set to a valid DocuSeal template id
- `is_enabled = true`

Important:

- Do **not** store API keys or webhook secrets in this table
- only non-secret provider metadata belongs here

## Webhook URL Shape

The current webhook function expects:

- `POST`
- JSON body from the provider
- a `secret` query parameter

The function checks:

```ts
const secret = String(new URL(req.url).searchParams.get("secret") || "").trim();
if (!DOCUSEAL_WEBHOOK_SECRET || secret !== DOCUSEAL_WEBHOOK_SECRET) {
  return respond({ error: "Unauthorized webhook" }, 401);
}
```

So the hosted webhook URL must look like:

```text
https://<project-ref>.supabase.co/functions/v1/handle-signature-webhook?secret=<DOCUSEAL_WEBHOOK_SECRET>
```

For your current production project ref:

```text
https://nodpjtkuefcmnxqxjtul.supabase.co/functions/v1/handle-signature-webhook?secret=<DOCUSEAL_WEBHOOK_SECRET>
```

## What URL To Enter In The Provider

The provider webhook URL is not invented by OASIS. The provider needs to call **your OASIS webhook endpoint**.

So the practical setup flow is:

1. Choose or generate the value for `DOCUSEAL_WEBHOOK_SECRET`
2. Save that value as a Supabase Edge Function secret
3. Build the hosted webhook URL using the function path above
4. Enter that full URL into the DocuSeal webhook/admin settings
5. Save
6. Trigger a test submission or provider webhook test event

## Suggested Setup Procedure

### Step 1. Set or rotate secrets

In Supabase project secrets, set:

- `DOCUSEAL_API_KEY`
- `DOCUSEAL_API_BASE_URL` if needed
- `DOCUSEAL_WEBHOOK_SECRET`

Use a long random string for `DOCUSEAL_WEBHOOK_SECRET`.

### Step 2. Deploy the two signature functions

```bash
supabase functions deploy create-signature-packet --project-ref nodpjtkuefcmnxqxjtul
supabase functions deploy handle-signature-webhook --project-ref nodpjtkuefcmnxqxjtul
```

### Step 3. Confirm account-level provider settings

Make sure the relevant account has:

- provider enabled
- DocuSeal base URL correct
- default signature template id set

### Step 4. Configure the provider webhook

In the provider admin UI:

- paste the OASIS webhook URL
- include the `secret=<DOCUSEAL_WEBHOOK_SECRET>` query value
- save the webhook

### Step 5. Run a real test packet

In OASIS:

1. create a document packet
2. prepare it for signature
3. send it through DocuSeal
4. complete it through the signer link
5. verify OASIS receives the webhook and updates the packet

### Step 6. Verify signed-document import

After completion, verify:

```sql
select id, account_id, title, signature_submission_id, signature_status,
       signature_completed_document_id, signature_requested_at, signature_synced_at, signature_error
from public.document_packets
where id = '<packet_id>';
```

Then verify the imported document:

```sql
select id, account_id, name, storage_path, source, visibility, created_at
from public.documents
where id = '<signature_completed_document_id>';
```

## Expected Runtime Sequence

For a healthy DocuSeal signature flow:

1. Manager prepares packet in OASIS
2. `create-signature-packet` creates provider submission
3. OASIS records `signature_submission_id`
4. Recipient opens signer URL
5. Provider calls `handle-signature-webhook`
6. OASIS updates `signature_status`
7. On completion, OASIS downloads and imports the signed PDF
8. Packet points at `signature_completed_document_id`

## Failure Patterns

### 1. Packet sends, but status never updates

Check:

- provider webhook is actually configured
- webhook URL is correct
- query-string secret is present
- `handle-signature-webhook` is deployed
- provider can reach the Supabase function URL

Typical symptoms:

- packet stays `pending`
- no `signature_synced_at`
- no signed document imported

### 2. Webhook returns 401

Likely cause:

- `DOCUSEAL_WEBHOOK_SECRET` mismatch
- webhook URL missing the `secret` query parameter

### 3. Webhook hits OASIS, but signed PDF is missing

Likely cause:

- `DOCUSEAL_API_KEY` is wrong
- provider submission lookup failed
- document download failed
- storage upload failed
- document import RPC failed

### 4. Recipient has no signer link

Likely cause:

- submission creation failed
- provider template id missing or invalid
- packet recipient has no email

## Support Team Checklist

When support is diagnosing a “signature not moving” report, confirm in this order:

1. account id
2. packet id
3. provider settings row exists and is enabled
4. packet has `signature_submission_id`
5. packet has `signature_submitter_url`
6. webhook URL is configured in provider
7. webhook secret matches
8. function is deployed
9. signed document import succeeded

Do not:

- disable RLS
- store provider secrets in database rows
- paste secrets into tickets or screenshots

## Related Files

- [document-workflow-operations.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/runbooks/document-workflow-operations.md)
- [create-signature-packet/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/create-signature-packet/index.ts)
- [handle-signature-webhook/index.ts](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/functions/handle-signature-webhook/index.ts)
- [document_signature_docuseal.sql](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase/document_signature_docuseal.sql)
