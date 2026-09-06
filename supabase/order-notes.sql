-- Run once in the existing project's Supabase SQL Editor.
-- Personal notes, available to the same account on all devices.
begin;

create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  weekly_order_id uuid not null references public.weekly_orders(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  pinned boolean not null default false,
  product_id uuid,
  product_name text,
  done boolean not null default false,
  completed_order_id uuid references public.weekly_orders(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_notes_owner_order_idx
  on public.order_notes(user_id, restaurant_id, weekly_order_id) where deleted_at is null;
create index if not exists order_notes_owner_pinned_idx
  on public.order_notes(user_id, restaurant_id) where pinned and deleted_at is null;

alter table public.order_notes enable row level security;
revoke all on public.order_notes from anon;
grant select, insert, update on public.order_notes to authenticated;

-- The user must own the note and belong to the referenced restaurant.
-- Also check the referenced order, not just the client-supplied restaurant ID.
drop policy if exists order_notes_select on public.order_notes;
create policy order_notes_select on public.order_notes for select to authenticated
using (user_id = (select auth.uid()) and restaurant_id in
  (select p.restaurant_id from public.profiles p where p.id = (select auth.uid())));

drop policy if exists order_notes_insert on public.order_notes;
create policy order_notes_insert on public.order_notes for insert to authenticated
with check (user_id = (select auth.uid()) and restaurant_id in
  (select p.restaurant_id from public.profiles p where p.id = (select auth.uid()))
  and exists (select 1 from public.weekly_orders w where w.id = weekly_order_id and w.restaurant_id = order_notes.restaurant_id)
  and (completed_order_id is null or exists (select 1 from public.weekly_orders w where w.id = completed_order_id and w.restaurant_id = order_notes.restaurant_id)));

drop policy if exists order_notes_update on public.order_notes;
create policy order_notes_update on public.order_notes for update to authenticated
using (user_id = (select auth.uid()) and restaurant_id in
  (select p.restaurant_id from public.profiles p where p.id = (select auth.uid())))
with check (user_id = (select auth.uid()) and restaurant_id in
  (select p.restaurant_id from public.profiles p where p.id = (select auth.uid()))
  and exists (select 1 from public.weekly_orders w where w.id = weekly_order_id and w.restaurant_id = order_notes.restaurant_id)
  and (completed_order_id is null or exists (select 1 from public.weekly_orders w where w.id = completed_order_id and w.restaurant_id = order_notes.restaurant_id)));

create or replace function public.order_notes_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger if exists order_notes_timestamp on public.order_notes;
create trigger order_notes_timestamp before update on public.order_notes
for each row execute function public.order_notes_timestamp();
commit;
