-- Расширение для генерации UUID
create extension if not exists pgcrypto;


-- =====================================================
-- ТАБЛИЦА РЕСТОРАНОВ
-- =====================================================

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  code text not null unique,

  created_by uuid not null
    references auth.users(id)
    on delete cascade,

  created_at timestamptz not null default now()
);


-- =====================================================
-- ТАБЛИЦА ПРОФИЛЕЙ
-- =====================================================

create table if not exists public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  full_name text not null,

  restaurant_id uuid not null
    references public.restaurants(id)
    on delete cascade,

  role text not null default 'admin'
    check (role in ('admin', 'manager', 'viewer')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =====================================================
-- ВКЛЮЧАЕМ ЗАЩИТУ RLS
-- =====================================================

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;


-- =====================================================
-- ПРАВА ДЛЯ РЕСТОРАНОВ
-- =====================================================

drop policy if exists "Users can view own restaurant"
on public.restaurants;

create policy "Users can view own restaurant"
on public.restaurants
for select
to authenticated
using (
  created_by = auth.uid()
  or id in (
    select restaurant_id
    from public.profiles
    where id = auth.uid()
  )
);


drop policy if exists "Restaurant owner can update restaurant"
on public.restaurants;

create policy "Restaurant owner can update restaurant"
on public.restaurants
for update
to authenticated
using (
  created_by = auth.uid()
)
with check (
  created_by = auth.uid()
);


-- =====================================================
-- ПРАВА ДЛЯ ПРОФИЛЕЙ
-- =====================================================

drop policy if exists "Users can view own profile"
on public.profiles;

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
);


drop policy if exists "Users can update own profile"
on public.profiles;

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
)
with check (
  id = auth.uid()
);


-- =====================================================
-- АВТОМАТИЧЕСКОЕ СОЗДАНИЕ РЕСТОРАНА И ПРОФИЛЯ
-- =====================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_restaurant_id uuid;
  clean_restaurant_code text;
begin

  clean_restaurant_code :=
    upper(
      regexp_replace(
        trim(
          coalesce(
            new.raw_user_meta_data ->> 'restaurant_code',
            ''
          )
        ),
        '\s+',
        '',
        'g'
      )
    );


  if trim(
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      ''
    )
  ) = '' then

    raise exception 'Full name is required';

  end if;


  if trim(
    coalesce(
      new.raw_user_meta_data ->> 'restaurant_name',
      ''
    )
  ) = '' then

    raise exception 'Restaurant name is required';

  end if;


  if clean_restaurant_code = '' then

    raise exception 'Restaurant code is required';

  end if;


  insert into public.restaurants (
    name,
    code,
    created_by
  )
  values (
    trim(
      new.raw_user_meta_data ->> 'restaurant_name'
    ),
    clean_restaurant_code,
    new.id
  )
  returning id into new_restaurant_id;


  insert into public.profiles (
    id,
    full_name,
    restaurant_id,
    role
  )
  values (
    new.id,
    trim(
      new.raw_user_meta_data ->> 'full_name'
    ),
    new_restaurant_id,
    'admin'
  );


  return new;

end;
$$;


-- Удаляем старый триггер, если он был
drop trigger if exists on_auth_user_created
on auth.users;


-- Создаем новый триггер
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();


-- =====================================================
-- АВТООБНОВЛЕНИЕ updated_at
-- =====================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin

  new.updated_at = now();

  return new;

end;
$$;


drop trigger if exists profiles_set_updated_at
on public.profiles;


create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();