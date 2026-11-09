-- Hardening: no function should be executable by anon; trigger/event-trigger functions
-- must not be callable through the API at all.

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- Pre-existing project function behind the "automatic RLS" event trigger (SECURITY DEFINER).
-- Event triggers do not need EXECUTE for API roles, so remove the RPC exposure.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
