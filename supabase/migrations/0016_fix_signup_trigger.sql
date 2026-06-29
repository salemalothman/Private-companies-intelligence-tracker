-- Fix: gen_random_bytes (pgcrypto) lives in the `extensions` schema, which the
-- trigger's search_path (public) can't see — every new signup was failing with
-- a 500. Schema-qualify the call.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, status, approval_token)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    case when lower(new.email) = 'salem.alothman@gmail.com'
         then 'active' else 'pending_approval' end,
    encode(extensions.gen_random_bytes(32), 'hex')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
