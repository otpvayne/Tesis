-- profiles: espejo de auth.users con el rol de aplicacion (USER | ADMIN).
-- Incluye funciones auxiliares compartidas por el resto de migraciones:
--   public.set_updated_at()  -> trigger generico para columnas updated_at
--   public.is_admin()        -> chequeo de rol usado en las politicas RLS de las demas tablas

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'USER' check (role in ('USER', 'ADMIN')),
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de aplicacion 1:1 con auth.users. El rol nunca lo asigna el propio usuario (ver trigger profiles_prevent_role_change).';

-- Trigger generico de updated_at, reutilizado por documents y otras tablas futuras.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Chequeo de rol admin, security definer para evitar recursion de RLS al
-- consultarse desde politicas de otras tablas (documents, ocr_results, etc.).
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- Nadie se autoasigna ADMIN: si el UPDATE no viene del service_role
-- (backend/administracion), el cambio de rol se descarta silenciosamente,
-- el resto de la fila si se actualiza.
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change
  before update on public.profiles
  for each row
  execute function public.prevent_role_change();

-- Crea el perfil automaticamente al registrarse en Supabase Auth, con
-- role = DEFAULT 'USER' (la columna nunca se pasa explicitamente aqui).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Sin policy de INSERT/DELETE: la fila la crea unicamente el trigger
-- on_auth_user_created (security definer, bypassa RLS).
