-- Private bucket "documents": active users read; admin/educator write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'image/png', 'image/jpeg', 'text/plain'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy documents_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_active_user()));

create policy documents_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents'
              and (select private.current_app_role()) in ('admin', 'educator'));

-- update/delete: admin, or the educator who uploaded the object
create policy documents_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'documents'
         and ((select private.is_admin())
              or ((select private.current_app_role()) = 'educator' and owner_id = (select auth.uid())::text)))
  with check (bucket_id = 'documents'
         and ((select private.is_admin())
              or ((select private.current_app_role()) = 'educator' and owner_id = (select auth.uid())::text)));

create policy documents_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and ((select private.is_admin())
              or ((select private.current_app_role()) = 'educator' and owner_id = (select auth.uid())::text)));
