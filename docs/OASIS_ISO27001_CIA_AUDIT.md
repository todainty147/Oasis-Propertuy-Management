# OASIS CIA Security Control Audit and ISO 27001 Benchmark

Assessment date: 2026-04-12  
Assessment type: repository-based technical control review  
Perspective: CISA/CISSP-style security, confidentiality, integrity, and availability assessment  
Standard benchmark: ISO/IEC 27001:2022 control expectations, with emphasis on Annex A technological and operational controls

## 1. Executive Opinion

OASIS demonstrates a strong technical security foundation for an early-stage SaaS application. The strongest evidence is concentrated in server-side authorization, account-scoped isolation, private storage controls, structured audit/observability, and automated security regression testing.

The application is **not ISO 27001 certification-ready from repository evidence alone**. ISO 27001 requires an Information Security Management System (ISMS), risk assessment and treatment records, control ownership, policies, internal audit, management review, supplier management, HR controls, incident process evidence, backup/restore evidence, and continual improvement artifacts. Those organizational controls are not materially evidenced in this repository.

From a technical-control perspective, OASIS is best assessed as:

- Confidentiality: strong for account isolation and storage access control; partial for formal data classification, DLP, and customer-managed encryption.
- Integrity: strong for guarded RPCs, append-only audit constructs, and regression coverage; partial for formal change approval, release governance, and production evidence retention.
- Availability: moderate; basic rate limiting, bootstrap/verify tooling, and operational docs exist, but formal resilience, DR testing, RTO/RPO, and SLO evidence are not yet mature.

Overall technical maturity rating: **Moderate to Strong for controlled early production use; Partial for ISO 27001 readiness.**

## 2. Scope and Evidence Reviewed

This review considered repository evidence only. It did not include:

- production Supabase dashboard configuration
- Vercel project configuration
- cloud provider contracts
- access review exports
- incident tickets
- backup restore logs
- employee onboarding/offboarding records
- penetration test reports
- vulnerability scan outputs
- management-approved policies

Primary repo evidence reviewed:

- [OASIS_WHITEPAPER_V5.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_WHITEPAPER_V5.md)
- [SECURITY_OBSERVABILITY.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/SECURITY_OBSERVABILITY.md)
- [API_RATE_LIMITING.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/API_RATE_LIMITING.md)
- [OASIS_ENGINEERING_ROADMAP.md](/mnt/c/Users/Home/oasisrentalmanagementapp/docs/OASIS_ENGINEERING_ROADMAP.md)
- [SECURITY_COVERAGE_MATRIX.md](/mnt/c/Users/Home/oasisrentalmanagementapp/tests/integration/SECURITY_COVERAGE_MATRIX.md)
- security, RLS, storage, audit, and rate-limit SQL overlays under [supabase](/mnt/c/Users/Home/oasisrentalmanagementapp/supabase)
- integration/security/e2e tests under [tests](/mnt/c/Users/Home/oasisrentalmanagementapp/tests)
- DB bootstrap/verify/apply scripts under [scripts](/mnt/c/Users/Home/oasisrentalmanagementapp/scripts)

## 3. Confidentiality Controls

### 3.1 Strengths

OASIS has a clear server-side security boundary. The React app and frontend service layer improve usability and normalize responses, but authoritative authorization is enforced in PostgreSQL RLS, security-definer RPCs, Supabase Auth identity, storage policies, and Edge Function secret checks.

Strong confidentiality evidence includes:

- account-scoped tables and relationships using `account_id`
- manager/tenant/contractor/root separation in SQL helpers and RPCs
- custom staff role support through `roles`, `role_permissions`, and `account_members.role_id`
- private document bucket usage with account-scoped object paths
- storage policies validating document path structure and calling `can_access_document_storage(...)`
- integration tests for cross-account denial, tenant scoping, contractor assignment scoping, invite acceptance, payment mutation, document access, and root support flows
- redaction rules that avoid logging invite tokens, signed URLs, storage paths, document filenames, passwords, authorization headers, secrets, and raw provider payloads in shared security logs
- hashed identifiers for API-rate limiting email/phone scopes rather than raw recipient storage

### 3.2 Key Confidentiality Risks

| Risk | Rating | Evidence / rationale | Recommendation |
| --- | --- | --- | --- |
| Formal data classification is not evidenced | Medium | The app distinguishes operational entities, but repo evidence does not show a formal classification scheme for customer, tenant, contractor, billing, document, and audit data. | Define data classes, handling rules, retention periods, and logging exclusions as controlled documentation. |
| Supabase platform encryption is relied on, but no application-level encryption exists | Low to Medium | Whitepaper accurately states AES-256 at rest and TLS in transit via Supabase-managed infrastructure. No per-field or customer-managed key model exists. | Accept for current scale, but document cryptographic ownership and evaluate field-level encryption only for future high-sensitivity data. |
| Hosted observability depends on application follow-up logging | Medium | Denied events are durable only when caller/app performs follow-up after exceptions. | Continue expanding shared service wrappers; document any direct-call surfaces where durable denied logging is not guaranteed. |
| Production access review evidence is absent from repo | Medium | Code supports roles and permissions, but ISO requires operational proof of periodic access review. | Add quarterly access review procedure and evidence template for Supabase, Vercel, GitHub, Resend/Twilio, and root app accounts. |

### 3.3 ISO 27001 Benchmark

| ISO 27001:2022 area | Status | Assessment |
| --- | --- | --- |
| A.5.15 Access control | Largely implemented technically | Strong RLS/RPC/storage policy model, but needs formal access control policy and periodic review evidence. |
| A.5.16 Identity management | Partial | Supabase Auth and account membership model exist; formal joiner/mover/leaver process not evidenced. |
| A.5.17 Authentication information | Partial | Secrets and password flows exist through Supabase/Edge Functions; password policy/MFA/admin credential process not evidenced. |
| A.5.18 Access rights | Partial to strong technically | Role management and tests exist; periodic review and privileged access approval evidence missing. |
| A.8.3 Information access restriction | Strong technically | Account/tenant/contractor isolation is well covered. |
| A.8.11 Data masking | Partial | Logging redaction exists; no formal masking policy or test suite for all log paths. |
| A.8.12 Data leakage prevention | Partial | Sensitive log exclusion is good, but no endpoint/network DLP evidence. |
| A.8.24 Use of cryptography | Partial | TLS/AES-256 via Supabase is documented; formal cryptographic policy/key ownership absent. |

## 4. Integrity Controls

### 4.1 Strengths

OASIS has strong application integrity controls around sensitive operations:

- security-definer RPCs centralize write authorization
- payment writes use authoritative RPCs and deny role-inappropriate mutations
- work-order status changes and tenant cancellation paths are audited
- document delete/tag workflows include audit evidence
- root lifecycle actions write security audit rows
- security audit ledger and denied-event streams include append-only mutation blockers
- schema regression guards protect critical linkage columns used by scoped access checks
- DB bootstrap/verify/apply scripts reduce drift between local and production schema overlays
- broad integration tests exercise real authenticated Supabase flows rather than only mocked UI paths

### 4.2 Key Integrity Risks

| Risk | Rating | Evidence / rationale | Recommendation |
| --- | --- | --- | --- |
| Formal release/change approval evidence is absent | Medium | Git commits and tests exist, but ISO change governance requires approval, rollback, and production deployment evidence. | Add lightweight change record template linking commit, migration, tests, deploy date, and rollback notes. |
| Audit ledger allows authenticated inserts where policy permits | Low to Medium | Table is append-only, but insert policy allows managers with feature access. Some actions may be better restricted to RPC-only insertion. | Consider moving security ledger inserts behind RPCs only for the most sensitive events. |
| Baseline/overlay process depends on disciplined production application | Medium | `db:apply:repo` and `db:verify` exist, but production execution is operator-driven. | Add production deployment checklist requiring post-apply verification queries and function deploy confirmation. |
| Dependency vulnerability management is not evidenced | Medium | Package dependencies exist, but no `npm audit`, Dependabot, SCA policy, or triage evidence is present. | Enable dependency scanning and define severity SLAs. |

### 4.3 ISO 27001 Benchmark

| ISO 27001:2022 area | Status | Assessment |
| --- | --- | --- |
| A.5.33 Protection of records | Partial | Append-only audit constructs exist; formal retention/legal hold policy not evidenced. |
| A.8.9 Configuration management | Partial | DB bootstrap/verify/apply scripts help; production config baseline evidence missing. |
| A.8.15 Logging | Strong technically | Denied, audit, observability, outbound events, and rate-limit events exist. Retention/evidence policy still needed. |
| A.8.25 Secure development lifecycle | Partial | Security tests and guardrails exist; formal SDLC policy and review gates not evidenced. |
| A.8.26 Application security requirements | Partial | Requirements are implied through tests/docs; formal security requirement traceability absent. |
| A.8.27 Secure system architecture | Strong technically | RLS/RPC/storage-policy architecture is coherent and well documented. |
| A.8.28 Secure coding | Partial to strong | Security-focused tests and service contracts exist; secure coding standard and peer review evidence not in repo. |
| A.8.29 Security testing in development and acceptance | Strong technically | Extensive integration/security/e2e coverage exists, especially for access control. Formal acceptance criteria should be documented. |

## 5. Availability Controls

### 5.1 Strengths

Availability controls are emerging and practical:

- local DB bootstrap, verify, seed, and E2E scripts support repeatable recovery of development/test environments
- `db:verify` checks launch-relevant schema objects
- rate limiting protects high-risk invite, password reset, scheduled email/SMS, and observability ingestion surfaces
- scheduled Edge Functions require cron secrets and log unauthorized/misconfigured invocations
- cleanup functions exist for security audit exports and observability events
- performance review documentation identifies dashboard/feed hotspots and defers heavier caching/partitioning until traffic justifies it
- whitepaper correctly states PITR as database-wide and account-level recovery as future work

### 5.2 Key Availability Risks

| Risk | Rating | Evidence / rationale | Recommendation |
| --- | --- | --- | --- |
| RTO/RPO are not defined | High for ISO readiness | Whitepaper discusses PITR limitations, but no formal targets or restore evidence exist. | Define RTO/RPO for database, storage, Edge Functions, and frontend. |
| Restore testing evidence is absent | High for ISO readiness | No documented production restore drill or backup verification record exists in repo. | Perform and document restore drills at least quarterly before scaling materially. |
| Account-level recovery is not implemented | Medium | PITR is database-wide; account-level recovery is roadmap only. | Keep claim accurate; design export/recovery workflow if customer operations require it. |
| Monitoring alert thresholds are not formalized | Medium | Observability data exists, but alerting thresholds/SLOs are roadmap items. | Define golden signals, thresholds, alert routing, and on-call response expectations. |
| Capacity management remains evidence-light | Medium | Performance review exists, but no production load data or capacity plan is present. | Add periodic performance review using production-safe metrics. |

### 5.3 ISO 27001 Benchmark

| ISO 27001:2022 area | Status | Assessment |
| --- | --- | --- |
| A.5.30 ICT readiness for business continuity | Partial | Technical recovery scripts exist; formal BCP/DR plans and exercises are missing. |
| A.8.6 Capacity management | Partial | Performance review and roadmap exist; measured capacity plan not evidenced. |
| A.8.13 Information backup | Partial | Supabase PITR model is recognized; backup configuration and restore testing evidence missing. |
| A.8.14 Redundancy of information processing facilities | Mostly inherited / not evidenced | Supabase/Vercel provide platform resilience, but customer-controlled evidence is absent. |
| A.8.16 Monitoring activities | Partial to strong technically | Logs and observability exist; operational alerting and response procedures need maturation. |
| A.8.21 Security of network services | Mostly inherited / partial | Supabase/Vercel networking is provider-managed; network service agreements and review evidence not in repo. |

## 6. ISO 27001 Clauses 4-10 Readiness

| Clause | Status | Audit view |
| --- | --- | --- |
| 4. Context of the organization | Gap | No ISMS scope, interested parties, or business/security context statement evidenced. |
| 5. Leadership | Gap | No security policy approval, role assignment, or management commitment evidence. |
| 6. Planning | Gap | No formal risk assessment, risk treatment plan, Statement of Applicability, or objectives. |
| 7. Support | Partial | Technical docs exist; competence, awareness, controlled documentation, and communication process not evidenced. |
| 8. Operation | Partial | Security engineering operations are active; formal operational planning/risk treatment execution not evidenced. |
| 9. Performance evaluation | Gap to partial | Test results and verification exist, but no internal audit, ISMS metrics, or management review evidence. |
| 10. Improvement | Partial | Roadmap and iterative remediation exist; formal corrective action process not evidenced. |

Conclusion: **The application can support future ISO 27001 readiness, but the ISMS is not evidenced by the repository.**

## 7. Priority Findings

### Finding 1: ISO 27001 ISMS evidence is not present

Severity: High for certification readiness  
CIA impact: governance over all three

The repo contains strong technical controls but not the management system evidence ISO 27001 requires.

Recommended actions:

- define ISMS scope
- create risk assessment and treatment process
- create Statement of Applicability
- approve access control, backup, logging, incident, supplier, secure development, and change policies
- define control owners and review cadence

### Finding 2: Backup and recovery controls are not yet audit-ready

Severity: High  
CIA impact: availability and integrity

The current position correctly relies on Supabase PITR where enabled, but restore test evidence, RTO/RPO, and account-level recovery are not implemented.

Recommended actions:

- document production backup configuration
- define RTO/RPO
- run restore drills
- document database-wide restore limitations
- build account-level export/recovery only if product/customer risk requires it

### Finding 3: Access control is technically strong but needs operational governance

Severity: Medium  
CIA impact: confidentiality and integrity

RLS/RPC/storage policies are strong. ISO readiness still requires documented periodic reviews of privileged access, root operators, GitHub, Supabase, Vercel, Resend, Twilio, and production database access.

Recommended actions:

- create quarterly access review evidence template
- document privileged access approval
- document offboarding steps
- verify MFA requirements for administrative consoles

### Finding 4: Logging and observability are strong but retention/response need formalization

Severity: Medium  
CIA impact: confidentiality, integrity, availability

The app captures meaningful security events and redacts sensitive data before logging. The remaining gap is response governance: retention periods, alert thresholds, triage ownership, and incident escalation.

Recommended actions:

- define retention for denied events, hosted observability events, audit ledger, outbound events, and provider logs
- define alert thresholds for rate-limit spikes, repeated denials, provider failures, and cron failures
- create incident runbook with severity levels

### Finding 5: Dependency and vulnerability management is not evidenced

Severity: Medium  
CIA impact: all three

The repo has modern dependencies and testing, but no clear vulnerability scanning workflow, triage SLA, or dependency review evidence.

Recommended actions:

- enable GitHub Dependabot or equivalent
- add `npm audit` or SCA workflow
- define remediation SLA by severity
- document exceptions and risk acceptance

## 8. Control Maturity Summary

| Domain | Maturity | Rationale |
| --- | --- | --- |
| Access control | Strong technical / partial governance | RLS/RPC/storage policies and tests are extensive; access reviews and IAM governance missing. |
| Data protection | Moderate to strong | Encryption inherited from Supabase, private storage, redaction, and scoped access exist; classification and DLP are partial. |
| Secure development | Moderate | Strong tests and docs; formal SDLC policy, SAST/SCA, peer review evidence not fully shown. |
| Logging and monitoring | Moderate to strong technical | Good event model; alerting, retention, and incident response process need maturity. |
| Backup and DR | Partial | PITR model acknowledged; restore evidence and RTO/RPO missing. |
| Supplier/cloud governance | Gap to partial | Supabase/Vercel/Resend/Twilio are used, but supplier risk evidence is not in repo. |
| Physical/HR security | Not assessed / gap from repo | ISO evidence must come from organizational records, not code. |

## 9. Certification Readiness Position

OASIS is **not ready to assert ISO 27001 compliance or certification** based on repository evidence.

OASIS is **well positioned to begin an ISO 27001 readiness program** because the technical architecture already supports several important Annex A controls:

- server-side access control
- information access restriction
- logging and monitoring
- secure architecture
- secure coding and security testing
- private storage and scoped document access
- rate limiting and abuse diagnostics

The next step should be an ISMS readiness phase, not more code alone.

## 10. Recommended 30/60/90 Day Plan

### First 30 Days

- Approve ISMS scope and security policy.
- Create risk register and Statement of Applicability draft.
- Document production access inventory.
- Define RTO/RPO and backup ownership.
- Enable dependency vulnerability scanning.
- Create production deployment and rollback checklist.

### 31-60 Days

- Run first privileged access review.
- Run first backup restore drill and record results.
- Define logging retention and alert thresholds.
- Create incident response runbook and severity model.
- Document supplier inventory and minimum vendor review.

### 61-90 Days

- Run internal audit against selected ISO controls.
- Perform tabletop incident exercise.
- Evidence secure SDLC controls in GitHub workflow.
- Formalize management review cadence.
- Decide whether to pursue SOC 2, ISO 27001, or both based on customer demand.

## 11. Auditor Conclusion

OASIS has a credible technical security foundation, especially around confidentiality and integrity. The strongest controls are database-authoritative authorization, RLS/RPC access enforcement, private storage policies, audit/observability design, and integration test coverage.

Availability and formal governance require the most maturity work. The repository supports operational readiness for controlled early production scale, but ISO 27001 alignment remains partial until the non-code ISMS controls are created, operated, and evidenced.

No certification claim should be made at this stage. The accurate statement is:

> OASIS has implemented several ISO 27001-aligned technical controls and is ready to begin an ISO 27001 readiness program, but it is not currently ISO 27001 certified or fully audit-ready.
