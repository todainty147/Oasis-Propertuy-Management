-- OBSOLETE / NON-AUTHORITATIVE
--
-- This legacy file is intentionally kept only to prevent accidental reuse.
-- It reflects an older owner_id-based security model and MUST NOT be applied
-- to the current multi-account OASIS schema.
--
-- Current security source-of-truth lives in the account-scoped migrations and
-- feature SQL files under supabase/, including:
-- - account_branding.sql
-- - account_invitations_saas.sql
-- - operations_foundations.sql
-- - automation_playbooks.sql
-- - storage_*_policies.sql
-- - current RPC/snapshot SQL files
--
-- If this file is executed, fail loudly so legacy policies cannot be mistaken
-- for the live security baseline.

do $$
begin
  raise exception
    'supabase/rls.sql is obsolete and must not be applied. Use the current account-scoped security migrations instead.';
end
$$;
