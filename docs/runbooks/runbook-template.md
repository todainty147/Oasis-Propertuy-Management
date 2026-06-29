# Runbook Template

Use this structure for new operational guides.

## Purpose

State what the module does and what it does not do.

## Scope and current status

Name whether the area is live, sandbox, demo-mode, gated, internal-only, or customer-facing.

## Critical invariants

List the boundaries that must not be violated.

## Key files

List routes, components, services, libraries, Edge Functions, SQL overlays, and tests.

## Data model / RPCs / functions

List relevant tables, views, RPCs, Edge Functions, and scheduled jobs.

## Normal operation

Describe the expected happy path.

## Common failure modes

For each symptom, include likely causes and the first checks.

## Triage checklist

Start read-only. Confirm account, actor, environment, and latest event before any remediation.

## Safe operator actions

List actions support or engineering may take without weakening evidence, security, billing, tax, or compliance boundaries.

## Unsafe actions / never do

List actions that would break evidence, account isolation, legal posture, tax safety, or billing integrity.

## Customer-safe wording

Provide short wording support can use without certifying outcomes.

## Escalation

Say when to escalate and to which owner group.

## Recovery / rollback notes

Describe reversible recovery steps, if any.

## Verification after fix

List UI checks, read-only SQL, logs, tests, or exports.

## Related tests

List contract, security, unit, and e2e tests protecting the area.
