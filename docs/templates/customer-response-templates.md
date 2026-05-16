# Customer Response Templates

Use these as starting points for Tenaqo support replies. Adjust the wording to the customer and do not expose internal IDs unless the customer already provided them.

## Initial Acknowledgement

Subject: We are checking this for you

Thanks for flagging this. We are checking the account context, role permissions, and recent activity around the action you attempted.

We will update you again by `<time>`. If you have a screenshot or the approximate time the issue happened, please send it through so we can match it to the right event window.

## Access Or Permission Issue

Subject: Access check in progress

We are reviewing the account and role linked to your profile. Tenaqo keeps account access deliberately scoped, so some screens and actions are only available to specific roles.

We will confirm whether this is expected role behavior or a configuration issue, then let you know the safest next step.

## Invite Or Password Reset Issue

Subject: Invite/reset link check in progress

We are checking the invitation or recovery flow and the email delivery status. Please avoid requesting several new links while we investigate, because newer links can make older ones invalid.

If you received more than one email, use only the newest one unless we advise otherwise.

## Provider Delivery Issue

Subject: Provider delivery check in progress

The Tenaqo handoff was received, and we are checking the external provider delivery status now.

We will confirm whether the issue is with the Tenaqo request, provider delivery, or the recipient mailbox route before retrying.

## Degraded Feature With Workaround

Subject: Temporary workaround available

We have identified a temporary workaround while we continue investigating the underlying issue:

`<workaround>`

This avoids blocking your immediate workflow. We will keep the ticket open until the underlying issue is verified as fixed.

## Resolved

Subject: Issue resolved

We have verified the issue and applied the fix.

What happened:
`<brief root cause>`

What changed:
`<brief remediation>`

Please try the action again and let us know if anything still looks wrong.

## Expected Behavior

Subject: Expected access behavior

We checked this and confirmed Tenaqo is behaving as designed for the current role/account.

The reason is:
`<plain-language reason>`

If you need a different level of access, an account owner or authorized manager will need to update the role or invite you with the correct permissions.

## Security Escalation Holding Reply

Subject: Security review in progress

We are treating this as a high-priority security review and have escalated it internally.

While we investigate, please do not change account memberships, resend invitations, or share links outside the account team unless we ask you to. We will provide the next update by `<time>`.

