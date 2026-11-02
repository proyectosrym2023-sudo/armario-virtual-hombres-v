-- =====================================================================
-- Armario Virtual Hombres · Supabase + Hotmart (V7) · RLS por usuario
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- Es idempotente: se puede volver a correr sin romper nada.
-- =====================================================================

-- ---------- 1. Licencias (las escribe SOLO el webhook de Hotmart) ----------
create table if not exists public.licencias (
  email             text primary key check (email = lower(email)),
  estado            text not null check (estado in ('activa','prueba','pendiente','cancelada','reembolsada','bloqueada')),
  hottok_evento     text,            -- activacion | inicio_prueba | renovacion | bloqueo_sesion | cancelacion | pendiente
  transaccion       text,
  producto_id       text,
  acceso_hasta      timestamptz,     -- null = sin vencimiento (pago único)
  ultimo_evento     text,
  ultimo_evento_en  timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
alter table public.licencias enable row level security;
drop policy if exists "licencia: leer la propia" on public.licencias;
create policy "licencia: leer la propia" on public.licencias
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));
-- Sin políticas de insert/update/delete: solo service_role (Edge Function) puede escribir.

-- ---------- 2. Registro de eventos Hotmart (idempotencia y auditoría) ----------
create table if not exists public.hotmart_eventos (
  id             text primary key,     -- body.id de Hotmart: repetir = duplicado
  evento         text not null,
  email          text,
  transaccion    text,
  hottok_evento  text,
  resultado      text,
  payload        jsonb,                -- payload mínimo, sin documento/dirección del comprador
  recibido_en    timestamptz not null default now()
);
alter table public.hotmart_eventos enable row level security;  -- sin políticas: invisible para clientes

-- ---------- 3. ¿El usuario actual tiene acceso? ----------
create or replace function public.licencia_activa()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.licencias l
    where l.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and l.estado in ('activa','prueba')
      and (l.acceso_hasta is null or l.acceso_hasta > now())
  );
$$;
revoke all on function public.licencia_activa() from public;
grant execute on function public.licencia_activa() to authenticated;

-- ---------- 4. Aplicar evento Hotmart de forma atómica y en orden ----------
-- Si llega un evento más viejo que el último aplicado (Hotmart reintenta), no pisa el estado.
create or replace function public.aplicar_evento_hotmart(
  p_email text, p_estado text, p_hottok text, p_transaccion text, p_producto text,
  p_acceso_hasta timestamptz, p_evento text, p_evento_en timestamptz
) returns text
language plpgsql security definer
set search_path = public
as $$
declare filas int;
begin
  insert into public.licencias as l (email, estado, hottok_evento, transaccion, producto_id, acceso_hasta, ultimo_evento, ultimo_evento_en, actualizado_en)
  values (lower(p_email), p_estado, p_hottok, p_transaccion, p_producto, p_acceso_hasta, p_evento, p_evento_en, now())
  on conflict (email) do update set
    estado = excluded.estado,
    hottok_evento = excluded.hottok_evento,
    transaccion = coalesce(excluded.transaccion, l.transaccion),
    producto_id = coalesce(excluded.producto_id, l.producto_id),
    acceso_hasta = excluded.acceso_hasta,
    ultimo_evento = excluded.ultimo_evento,
    ultimo_evento_en = excluded.ultimo_evento_en,
    actualizado_en = now()
  where l.ultimo_evento_en is null or excluded.ultimo_evento_en >= l.ultimo_evento_en;
  get diagnostics filas = row_count;
  return case when filas = 1 then 'aplicado' else 'evento_antiguo' end;
end;
$$;
revoke all on function public.aplicar_evento_hotmart(text,text,text,text,text,timestamptz,text,timestamptz) from public, anon, authenticated;
grant execute on function public.aplicar_evento_hotmart(text,text,text,text,text,timestamptz,text,timestamptz) to service_role;

-- ---------- 5. Respaldo opcional de prendas (sin medidas ni fotos del cuerpo) ----------
create table if not exists public.prendas (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos           jsonb not null,
  foto_path       text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists prendas_user_idx on public.prendas(user_id);
alter table public.prendas enable row level security;

drop policy if exists "prendas: leer propias" on public.prendas;
create policy "prendas: leer propias" on public.prendas
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "prendas: borrar propias" on public.prendas;
create policy "prendas: borrar propias" on public.prendas
  for delete to authenticated using (user_id = auth.uid());   -- siempre puede borrar, aun sin licencia

drop policy if exists "prendas: crear con licencia" on public.prendas;
create policy "prendas: crear con licencia" on public.prendas
  for insert to authenticated with check (user_id = auth.uid() and public.licencia_activa());

drop policy if exists "prendas: editar con licencia" on public.prendas;
create policy "prendas: editar con licencia" on public.prendas
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.licencia_activa());

-- ---------- 6. Medición de costes de IA ----------
create table if not exists public.ai_usage (
  id                     bigint generated always as identity primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  created_at             timestamptz not null default now(),
  modelo                 text not null,
  input_tokens           int not null default 0,
  output_tokens          int not null default 0,
  cache_read_tokens      int not null default 0,
  cache_write_tokens     int not null default 0,
  costo_usd              numeric(12,6) not null default 0,
  latencia_ms            int,
  ok                     boolean not null default true,
  error                  text
);
create index if not exists ai_usage_user_mes_idx on public.ai_usage(user_id, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage: leer el propio" on public.ai_usage;
create policy "ai_usage: leer el propio" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());
-- Insert solo desde la Edge Function (service_role).

-- Resumen para el dueño del producto (solo visible con service_role / SQL Editor).
create or replace view public.costes_ia_mensual
with (security_invoker = true) as
select date_trunc('month', created_at) as mes,
       modelo,
       count(*) filter (where ok)            as escaneos,
       count(distinct user_id)               as usuarios,
       sum(input_tokens + output_tokens)     as tokens,
       round(sum(costo_usd), 4)              as costo_usd,
       round(sum(costo_usd) / nullif(count(*) filter (where ok), 0), 6) as costo_por_escaneo
from public.ai_usage
group by 1, 2
order by 1 desc, 2;
revoke all on public.costes_ia_mensual from anon, authenticated;

-- ---------- 7. Storage privado: prendas/<user_id>/<prenda>.webp ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prendas', 'prendas', false, 2097152, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos: leer propias" on storage.objects;
create policy "fotos: leer propias" on storage.objects
  for select to authenticated
  using (bucket_id = 'prendas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: borrar propias" on storage.objects;
create policy "fotos: borrar propias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prendas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: subir con licencia" on storage.objects;
create policy "fotos: subir con licencia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prendas' and (storage.foldername(name))[1] = auth.uid()::text and public.licencia_activa());

drop policy if exists "fotos: reemplazar con licencia" on storage.objects;
create policy "fotos: reemplazar con licencia" on storage.objects
  for update to authenticated
  using (bucket_id = 'prendas' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'prendas' and (storage.foldername(name))[1] = auth.uid()::text and public.licencia_activa());

-- ---------- 8. Verificación (debe devolver rls = true en las 4 tablas) ----------
select relname as tabla, relrowsecurity as rls
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('licencias','hotmart_eventos','prendas','ai_usage');
