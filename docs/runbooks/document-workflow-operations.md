# Document Workflow Operations Runbook

Use this when templates, document requests, participant uploads, or agreement packets do not look right in the app.

## Current State

- Landlords/admins can upload account-scoped document templates in `Documents`.
- No legal templates are seeded by default. An empty template library is expected until a landlord uploads their own UK, Poland, or other country-specific template.
- Landlords/admins can request documents from tenants and contractors.
- Tenants and contractors can upload only to requests targeted at them.
- Landlords/admins can create and send pre-signature agreement packets from active templates.
- Tenants and contractors can view and complete only their own packets.
- Signature readiness metadata exists for account-scoped provider setup and packet signature status.
- External provider API calls and webhook PDF import are not implemented yet. Agreement packets are a review/completion foundation for the e-signature adapter.

## First Checks

Always confirm:

- the correct `account_id`
- the signed-in user's effective role and permissions
- the target tenant or contractor row is linked to the expected user
- the template, request, packet, and document rows belong to the same account

Never disable RLS to diagnose access.

## Template Library Is Empty

This is expected for a new account.

Inspect templates:

```sql
select id, account_id, country_code, language, template_type, name, status, upload_status, created_at
from public.document_templates
where account_id = '<account_id>'
order by updated_at desc;
```

Expected usable rows have:

- `status = 'active'`
- `upload_status = 'uploaded'`

If only draft/stub rows exist, check storage upload/finalization errors before creating packets.

## Tenant Or Contractor Cannot See A Request

Inspect the request target:

```sql
select id, account_id, target_role, tenant_id, contractor_id, property_id, status, title, created_at
from public.document_requests
where account_id = '<account_id>'
order by created_at desc;
```

For tenant requests, verify the tenant row:

```sql
select id, account_id, user_id, email, status, archived_at
from public.tenants
where account_id = '<account_id>'
  and id = '<tenant_id>';
```

For contractor requests, verify the contractor row:

```sql
select id, account_id, user_id, email, status
from public.contractors
where account_id = '<account_id>'
  and id = '<contractor_id>';
```

Common causes:

- accepted invite created account membership but did not link `tenants.user_id` or `contractors.user_id`
- request was created for the wrong target role
- target row belongs to another account
- target row is archived or inactive

## Upload Exists But Landlord Cannot Review It

Inspect upload linkage:

```sql
select dru.id, dru.account_id, dru.request_id, dru.document_id, dru.uploaded_by,
       dru.uploaded_by_role, dru.review_status, d.storage_path, d.visibility, d.source
from public.document_request_uploads dru
join public.documents d on d.id = dru.document_id
where dru.account_id = '<account_id>'
order by dru.created_at desc;
```

The upload row and document row must share the same account. The document should remain request-scoped until reviewed.

## Packet Missing For Tenant Or Contractor

Inspect packet and recipient rows:

```sql
select id, account_id, template_id, target_role, tenant_id, contractor_id,
       property_id, packet_type, status, title, created_at
from public.document_packets
where account_id = '<account_id>'
order by created_at desc;
```

```sql
select id, account_id, packet_id, role, user_id, tenant_id, contractor_id,
       email, status, sent_at, viewed_at, completed_at
from public.document_packet_recipients
where account_id = '<account_id>'
order by created_at desc;
```

Expected recipient visibility:

- tenant packet: recipient `tenant_id` matches the tenant row and `user_id` matches the tenant auth user when linked
- contractor packet: recipient `contractor_id` matches the contractor row and `user_id` matches the contractor auth user when linked

If a packet remains invisible, check that the participant has a valid tenant/contractor link in the same account.

## Packet Lifecycle Audit

Inspect packet events:

```sql
select packet_id, event_type, actor_user_id, message, created_at
from public.document_packet_events
where account_id = '<account_id>'
order by created_at desc;
```

Expected event sequence for the current pre-signature workflow:

- `created`
- `sent`
- `viewed`
- `completed`

`voided` is manager-only and should not be available after completion.

## Signature Readiness Looks Wrong

Inspect account-level provider metadata:

```sql
select account_id, provider, provider_base_url, default_signature_template_id,
       is_enabled, webhook_configured, configured_by, configured_at, updated_at
from public.document_signature_provider_settings
where account_id = '<account_id>';
```

This table stores metadata only. Do not put API keys, webhook secrets, or provider credentials in it. Provider secrets belong in Supabase Edge Function environment variables.

Inspect packet signature state:

```sql
select id, account_id, title, status, signature_provider, signature_template_id,
       signature_submission_id, signature_status, signature_completed_document_id,
       signature_requested_at, signature_synced_at, signature_error
from public.document_packets
where account_id = '<account_id>'
order by updated_at desc;
```

Expected readiness states:

- `not_configured`: no provider/template has been prepared for this packet
- `ready`: manager prepared the packet for the configured provider
- `pending` or `requested`: future provider adapter has recorded a submission
- `completed`: future provider adapter has confirmed completion
- `failed` or `cancelled`: provider sync failed or was cancelled

Only service-role Edge Functions should record provider submission IDs or sync external status.

## Storage Policy Order Problems

The document storage policy overlay is order-safe. It checks for document request tables before referencing them. If storage policies fail during bootstrap, confirm these overlays are applied in this order:

1. `document_templates.sql`
2. `document_requests.sql`
3. `document_packets.sql`
4. `document_signature_readiness.sql`
5. `storage_documents_policies.sql`

Do not remove the request-aware helper guard in `storage_documents_policies.sql`; it prevents deployments from failing when a lower environment applies storage policies before the request tables exist.
