-- Admin-gated onboarding: new accounts default to 'pending_approval' and are
-- blocked from the app until an admin approves them via a tokenized link.
create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists status text not null default 'pending_approval'
    check (status in ('pending_approval', 'active')),
  add column if not exists email text,
  add column if not exists approval_token text,
  add column if not exists approved_at timestamptz;

-- A nullable unique token (cleared on approval). Postgres treats NULLs as
-- distinct, so many approved rows can share NULL.
create unique index if not exists profiles_approval_token_idx
  on public.profiles (approval_token)
  where approval_token is not null;

-- Existing accounts predate the gate — grandfather them in as active.
update public.profiles set status = 'active' where approved_at is null;

-- Recreate the signup trigger: capture email, mint a 256-bit approval token,
-- and auto-activate the platform admin so they're never locked out.
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
    encode(gen_random_bytes(32), 'hex')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
