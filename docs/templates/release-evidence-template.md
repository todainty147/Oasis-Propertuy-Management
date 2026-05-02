# OASIS Release Evidence Template

Copy this template for every production-facing release or recovery drill.

## Release Metadata

- Release ID:
- Date:
- Release owner:
- Reviewer / approver:
- Environment:
- Git branch:
- Commit SHA:
- Customer-visible risk: low / medium / high
- Planned release window:
- Actual release window:

## Scope

- Product areas changed:
- SQL files changed:
- Edge Functions changed:
- App routes/pages changed:
- Environment/secrets changed:
- Provider configuration changed:
- Documentation changed:

## Pre-Release Gates

- `npm run build` result:
- `npm run test:e2e:critical` result:
- `npm run test:e2e:extended` result, if required:
- `npm run test:e2e:visual` result, if required:
- Integration/security test result, if required:
- Manual review completed by:

## Database Evidence

- `db:apply:repo` run: yes / no
- Target database:
- Apply output reviewed by:
- Hard errors:
- Notices accepted:
- DB verification run:
- Object/RPC checks:
- Data backfill required:
- Data backfill completed:

## Edge Function Evidence

- Functions deployed:
- Project ref:
- Deploy output reviewed by:
- Secrets changed:
- Provider logs checked:
- Test recipient/account used:

## App Deploy Evidence

- Vercel deployment URL:
- Production domain checked:
- `APP_URL` checked:
- Supabase redirect URLs checked:
- Cache/reload check completed:

## Post-Deploy Smoke

- Owner/manager login:
- Dashboard:
- Properties:
- Tenants:
- Finance:
- Documents:
- Maintenance Inbox:
- Command Center:
- Portfolio Health:
- Root telemetry, if applicable:
- Invite/reset flow, if applicable:
- Email/SMS/provider flow, if applicable:
- Subscription-gated route behavior:
- Console/network errors reviewed:

## Rollback Readiness

- Previous app deployment identified:
- Previous Edge Function commit identified:
- SQL recovery plan:
- Provider fallback:
- Backup/PITR status checked:
- Rollback owner:

## Recovery Or Drill Notes

- Restore point, if applicable:
- Restore target, if applicable:
- RTO observed:
- RPO observed:
- Data loss window:
- Storage verification:
- Account-level recovery required:

## Signoff

- Release status: passed / failed / rolled back / partially released
- Signoff owner:
- Follow-up issues:
- Notes:

