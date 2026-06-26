-- Private bucket for uploaded documents (PDF investor decks etc.), 50MB cap.
-- Files are uploaded directly from the browser via a service-role-issued signed
-- URL (see createDocUploadUrl), bypassing the Server Action body limit (1MB
-- local / 4.5MB on Vercel) that breaks large decks. Processing downloads the
-- stored file server-side (processStoredPdf). Applied via the storage API when
-- this migration's MCP path was unavailable; kept here for reproducibility.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Defense-in-depth for any direct (non-signed-URL) access: authenticated users
-- may touch objects only under a company folder they own ({companyId}/file).
drop policy if exists documents_rw_own on storage.objects;
create policy documents_rw_own on storage.objects
  for all to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.companies c
      where c.id::text = (storage.foldername(name))[1]
        and c.user_id = auth.uid()
    )
  );
