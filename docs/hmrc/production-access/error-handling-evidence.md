# HMRC error handling evidence

| Condition | Internal status | User/support action | Retry |
| --- | --- | --- | --- |
| 400 validation | `bad_request` | Review identifiers, period and records | After correction |
| 401 token | `token_expired` | Refresh/reconnect HMRC | After authentication |
| 403 scope | `insufficient_scope` | Reconnect with required scope | After scope correction |
| 404 source | `connected_but_no_data` | Check business source | After correction |
| 409 duplicate | `already_submitted` | Reconcile receipt/read-back | Never blindly |
| 422 business rule | `business_rule_failed` | Review period and records | After correction |
| 429 rate limit | `rate_limited` | Wait/back off | Delayed |
| 500/503 | `hmrc_unavailable` | Preserve attempt and retry later | Delayed |
| Timeout | `network_timeout` | Check HMRC status and attempt state | Only if acceptance is ruled out |
| 204 | `success` | Record accepted/no body | No |
| Accepted/local write failed | `accepted_local_write_failed` | Operator recovery and reconciliation | Never blindly |
| Read-back failed | `readback_failed` | Preserve acceptance and reconcile | Read-only retry only |

Errors expose safe codes and copy. Tokens, secrets, fraud-header values, and raw payloads are excluded from diagnostics and evidence.

The controlled live-pilot transport applies a bounded timeout and always returns a structured outcome. Known timeout and connection failures complete the local attempt instead of leaving it pending. A timeout, reset, or ambiguous transport failure uses `unknown_acceptance_state` semantics and warns support not to retry blindly until receipt/read-back state has been reconciled. Accepted `204 No Content` remains an accepted result.
