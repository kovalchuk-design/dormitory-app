-- Admin user management rules. Run as ONE statement (execute_sql); everything is rolled back by the final exception.
-- Expected message: REPORT demote_other_ok;blocked_demote:LAST_ADMIN;blocked_deactivate:LAST_ADMIN;blocked_delete:LAST_ADMIN;nonadmin_rejected:FORBIDDEN;
do $$
declare owner uuid; ta uuid := gen_random_uuid(); rep text := '';
begin
  select id into owner from public.profiles where role = 'admin' and is_active order by created_at limit 1;
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values ('00000000-0000-0000-0000-000000000000',ta,'authenticated','authenticated','test+rules@example.com','x',now(),'{}','{}',now(),now());
  update public.profiles set role='admin', is_active=true where id=ta;
  update public.profiles set is_active=false where role='admin' and id not in (owner, ta);
  perform public.svc_admin_update_profile(owner, ta, p_role=>'educator');   -- two admins: allowed
  rep := rep || 'demote_other_ok;';
  perform public.svc_admin_update_profile(owner, ta, p_is_active=>false);   -- owner is now the last active admin
  begin update public.profiles set role='educator' where id=owner; rep := rep || 'NOT_BLOCKED;';
  exception when others then rep := rep || 'blocked_demote:' || left(sqlerrm,10) || ';'; end;
  begin update public.profiles set is_active=false where id=owner; rep := rep || 'NOT_BLOCKED;';
  exception when others then rep := rep || 'blocked_deactivate:' || left(sqlerrm,10) || ';'; end;
  begin delete from public.profiles where id=owner; rep := rep || 'NOT_BLOCKED;';
  exception when others then rep := rep || 'blocked_delete:' || left(sqlerrm,10) || ';'; end;
  begin perform public.svc_admin_update_profile(ta, owner, p_full_name=>'x'); rep := rep || 'NONADMIN_ALLOWED;';
  exception when others then rep := rep || 'nonadmin_rejected:' || left(sqlerrm,9) || ';'; end;
  raise exception 'REPORT %', rep;
end $$;
