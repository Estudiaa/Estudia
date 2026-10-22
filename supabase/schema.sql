-- Estudia! — esquema de base de datos (Supabase / Postgres)
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run.
-- Seguridad: Row Level Security activada en TODAS las tablas. Cada estudiante
-- solo puede leer y modificar sus propias filas (user_id = auth.uid()).

-- ---------- Tablas ----------

create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nombre             text not null default '' check (char_length(nombre) <= 120),
  universidad        text check (char_length(universidad) <= 160),
  carrera            text check (char_length(carrera) <= 160),
  anio_ingreso       int  check (anio_ingreso between 1990 and 2100),
  escala_max         numeric(2,1) not null default 7.0,
  acepto_terminos_at timestamptz,
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists public.semestres (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  anio       int  not null check (anio between 1990 and 2100),
  numero     int  not null check (numero in (1, 2)),
  etiqueta   text not null check (char_length(etiqueta) <= 60),
  activo     boolean not null default true,
  promedio   numeric(3,2),
  cerrado_at timestamptz,
  created_at timestamptz not null default now()
);
-- Un solo semestre activo por estudiante.
create unique index if not exists semestres_un_activo on public.semestres (user_id) where activo;

create table if not exists public.ramos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  semestre_id      uuid not null references public.semestres (id) on delete cascade,
  nombre           text not null check (char_length(nombre) between 1 and 120),
  horas_semana     numeric(4,1) not null default 6 check (horas_semana between 0 and 80),
  nota_aprobacion  numeric(2,1) not null default 4.0 check (nota_aprobacion between 1.0 and 7.0),
  asist_requerida  int not null default 75 check (asist_requerida between 0 and 100),
  asist_total      int not null default 30 check (asist_total between 0 and 500),
  asist_realizadas int not null default 0  check (asist_realizadas between 0 and 500),
  asist_asistidas  int not null default 0  check (asist_asistidas between 0 and 500),
  nota_final       numeric(2,1) check (nota_final between 1.0 and 7.0),
  created_at       timestamptz not null default now(),
  constraint asistencia_coherente check (asist_asistidas <= asist_realizadas and asist_realizadas <= asist_total)
);

-- Nota de presentación a examen (opcional). np_peso = % de la nota final que vale la NP;
-- np_min_examen = NP mínima para dar examen; np_eximicion = NP para eximirse (null = examen obligatorio).
alter table public.ramos add column if not exists np_peso numeric(4,1) check (np_peso > 0 and np_peso < 100);
alter table public.ramos add column if not exists np_min_examen numeric(2,1) check (np_min_examen between 1.0 and 7.0);
alter table public.ramos add column if not exists np_eximicion numeric(2,1) check (np_eximicion between 1.0 and 7.0);

create table if not exists public.evaluaciones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ramo_id     uuid not null references public.ramos (id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 80),
  ponderacion numeric(5,2) not null default 0 check (ponderacion between 0 and 100),
  nota        numeric(2,1) check (nota between 1.0 and 7.0),
  fecha       date,
  created_at  timestamptz not null default now()
);

-- Evaluaciones que son el promedio de varias notas (ej: "Controles", 20%, 4 notas).
-- cantidad = número de notas; notas = cada nota (null = pendiente). Con cantidad 1 se usa la columna nota.
alter table public.evaluaciones add column if not exists cantidad int not null default 1 check (cantidad between 1 and 20);
alter table public.evaluaciones add column if not exists notas numeric(2,1)[] check (
  notas is null or (cardinality(notas) <= 20 and 1.0 <= all(notas) and 7.0 >= all(notas)));
-- 'presentacion' = la ponderación es % de la nota de presentación; 'curso' = % de la nota final.
alter table public.evaluaciones add column if not exists seccion text not null default 'curso' check (seccion in ('curso', 'presentacion'));
-- La suma de ponderaciones = 100 se valida en la app (al crear un ramo es obligatoria
-- y en el detalle se avisa si no cuadra), porque se edita una evaluación a la vez.

create index if not exists semestres_user_idx    on public.semestres (user_id);
create index if not exists ramos_user_idx        on public.ramos (user_id);
create index if not exists ramos_semestre_idx    on public.ramos (semestre_id);
create index if not exists evaluaciones_user_idx on public.evaluaciones (user_id);
create index if not exists evaluaciones_ramo_idx on public.evaluaciones (ramo_id);

-- ---------- Row Level Security ----------

alter table public.profiles     enable row level security;
alter table public.semestres    enable row level security;
alter table public.ramos        enable row level security;
alter table public.evaluaciones enable row level security;

drop policy if exists "perfil: leer propio"       on public.profiles;
drop policy if exists "perfil: crear propio"      on public.profiles;
drop policy if exists "perfil: actualizar propio" on public.profiles;
create policy "perfil: leer propio"       on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "perfil: crear propio"      on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "perfil: actualizar propio" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "semestres: leer"       on public.semestres;
drop policy if exists "semestres: crear"      on public.semestres;
drop policy if exists "semestres: actualizar" on public.semestres;
drop policy if exists "semestres: borrar"     on public.semestres;
create policy "semestres: leer"       on public.semestres for select to authenticated using (user_id = (select auth.uid()));
create policy "semestres: crear"      on public.semestres for insert to authenticated with check (user_id = (select auth.uid()));
create policy "semestres: actualizar" on public.semestres for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "semestres: borrar"     on public.semestres for delete to authenticated using (user_id = (select auth.uid()));

-- Además de ser dueño de la fila, el ramo debe colgar de un semestre propio.
drop policy if exists "ramos: leer"       on public.ramos;
drop policy if exists "ramos: crear"      on public.ramos;
drop policy if exists "ramos: actualizar" on public.ramos;
drop policy if exists "ramos: borrar"     on public.ramos;
create policy "ramos: leer"       on public.ramos for select to authenticated using (user_id = (select auth.uid()));
create policy "ramos: crear"      on public.ramos for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.semestres s where s.id = semestre_id and s.user_id = (select auth.uid())));
create policy "ramos: actualizar" on public.ramos for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.semestres s where s.id = semestre_id and s.user_id = (select auth.uid())));
create policy "ramos: borrar"     on public.ramos for delete to authenticated using (user_id = (select auth.uid()));

-- La evaluación debe colgar de un ramo propio.
drop policy if exists "evaluaciones: leer"       on public.evaluaciones;
drop policy if exists "evaluaciones: crear"      on public.evaluaciones;
drop policy if exists "evaluaciones: actualizar" on public.evaluaciones;
drop policy if exists "evaluaciones: borrar"     on public.evaluaciones;
create policy "evaluaciones: leer"       on public.evaluaciones for select to authenticated using (user_id = (select auth.uid()));
create policy "evaluaciones: crear"      on public.evaluaciones for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.ramos r where r.id = ramo_id and r.user_id = (select auth.uid())));
create policy "evaluaciones: actualizar" on public.evaluaciones for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.ramos r where r.id = ramo_id and r.user_id = (select auth.uid())));
create policy "evaluaciones: borrar"     on public.evaluaciones for delete to authenticated using (user_id = (select auth.uid()));

-- Los visitantes sin sesión no tienen acceso a nada.
revoke all on public.profiles, public.semestres, public.ramos, public.evaluaciones from anon;

-- ---------- Comentarios de la beta ----------
-- Los estudiantes solo pueden ENVIAR comentarios propios; no pueden leer ni editar
-- ninguno. El dueño los lee desde el Table Editor del panel de Supabase.

create table if not exists public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo       text not null default 'otro' check (tipo in ('idea', 'error', 'otro')),
  mensaje    text not null check (char_length(mensaje) between 3 and 2000),
  pantalla   text check (char_length(pantalla) <= 40),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists comentarios_created_idx on public.comentarios (created_at desc);

alter table public.comentarios enable row level security;
drop policy if exists "comentarios: crear propio" on public.comentarios;
create policy "comentarios: crear propio" on public.comentarios for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.comentarios from anon;

-- ---------- Perfil automático al registrarse ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, acepto_terminos_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 120),
    case when (new.raw_user_meta_data ->> 'acepto_terminos') = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
