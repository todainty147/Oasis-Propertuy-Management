# Early Users & Feedback

This feature captures lightweight signup attribution, consent, activation milestones, and founder feedback status for root operators.

## Data Captured

- `user_profiles`: user email, name, language, and country profile fields.
- `signup_intelligence`: signup type, source, UTM values, referrer, landing path, locale, account, and user.
- `user_contact_preferences`: feedback, product-update, and marketing opt-ins. Signup checkboxes are not pre-ticked.
- `user_feedback_requests`: root-managed follow-up status, channel, notes, and rating.
- `user_activation_events`: low-risk milestones such as first property, first tenant, first document, maintenance request, work order, rent record, and founder offer.

## Root Operator Workflow

Open `Root -> Early Users` from the sidebar. The page shows signups, founder users, activated users, feedback opt-ins, and users not yet contacted. Use the filters for signup type, feedback status, and founder-only cohorts.

Selecting a row opens the feedback panel. Root operators can update notes, rating, and status to `contacted`, `responded`, `declined`, or `do_not_contact`.

## RPCs

- `record_signup_intelligence(...)`: authenticated user or service role only. Upserts profile/preferences, stores signup source, creates an initial feedback request, and records the signup activation event.
- `record_user_activation_event(p_account_id, p_event_key, p_metadata)`: authenticated account managers only, with service-role bypass for backend jobs. `first_*` events are idempotent per user/account/event.
- `early_users_admin_list(...)`: root operator only.
- `update_feedback_status(...)`: root operator only.
- `early_user_detail(...)`: root operator only.

## Privacy Notes

The signup capture is non-blocking. If the RPC fails after account creation, signup still completes and the user lands in the app. The optional checkboxes are separate from account creation and do not imply marketing consent.

The raw tables have RLS enabled. Ordinary users can read/update their own profile and contact preferences where appropriate; root operator access goes through security-definer RPCs.
