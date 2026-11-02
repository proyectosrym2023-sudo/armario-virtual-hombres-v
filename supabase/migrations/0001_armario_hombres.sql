-- =====================================================================
-- ARMARIO VIRTUAL HOMBRES · Esquema v2 (Next.js + Supabase + Hotmart suscripción)
-- Ejecutar en Supabase → SQL Editor, o con `supabase db push`.
-- Idempotente en lo posible. Requiere: Auth con confirmación de email ACTIVADA.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Catálogos (como CHECK para no depender de tablas extra)
-- Categorías (5): ropa, lentes, pulseras, cadenas, relojes
-- ---------------------------------------------------------------------

-- ---------- users (espejo de auth.users) ----------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique check (email = lower(email)),
  created_at  timestamptz not null default now()
);

-- ---------- user_profiles (privado) ----------
create table if not exists public.user_profiles (
  user_id                     uuid primary key references public.users(id) on delete cascade,
  weight                      numeric(5,1) check (weight is null or (weight > 0 and weight < 700)),
  weight_unit                 text not null default 'kg' check (weight_unit in ('kg','lb')),
  weight_updated_at           timestamptz,
  shirt_size                  text check (char_length(shirt_size) <= 12),
  polo_size                   text check (char_length(polo_size) <= 12),
  trouser_size                text check (char_length(trouser_size) <= 12),
  jeans_size                  text check (char_length(jeans_size) <= 12),
  shorts_size                 text check (char_length(shorts_size) <= 12),
  jacket_size                 text check (char_length(jacket_size) <= 12),
  blazer_size                 text check (char_length(blazer_size) <= 12),   -- saco
  suit_size                   text check (char_length(suit_size) <= 12),
  sportswear_size             text check (char_length(sportswear_size) <= 12),
  size_system                 text not null default 'letras' check (size_system in ('letras','numerico','mixto')),
  -- {chest,waist,hip,inseam,sleeve,neck,wrist,chain_length,ring,glasses_lens,glasses_bridge,glasses_temple,
  --  trouser_waist,trouser_length}: cada una {"value": number, "unit": "cm"|"in"|"mm"|"talla"}
  measurements                jsonb not null default '{}'::jsonb check (jsonb_typeof(measurements) = 'object'),
  preferred_measurement_unit  text not null default 'cm' check (preferred_measurement_unit in ('cm','in')),
  updated_at                  timestamptz not null default now()
);

-- ---------- weight_history (privado) ----------
create table if not exists public.weight_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  weight       numeric(5,1) not null check (weight > 0 and weight < 700),
  unit         text not null check (unit in ('kg','lb')),
  recorded_at  date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists weight_history_user_idx on public.weight_history(user_id, recorded_at desc);

-- ---------- wardrobe_items ----------
create table if not exists public.wardrobe_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references public.users(id) on delete cascade,
  category            text not null check (category in ('ropa','lentes','pulseras','cadenas','relojes')),
  item_type           text not null,
  name                text check (char_length(name) <= 80),
  color               text not null check (char_length(color) between 1 and 40),
  color_hex           text check (color_hex ~ '^#[0-9a-f]{6}$'),
  main_season         text not null check (main_season in ('verano','otono','invierno','primavera')),
  additional_seasons  text[] not null default '{}',
  clothing_size       text check (char_length(clothing_size) <= 12),
  brand_optional      text check (char_length(brand_optional) <= 60),
  notes               text check (char_length(notes) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint item_type_valido check (
    (category = 'ropa' and item_type in ('camisa','polo','pantalon','shorts','jeans','traje','saco','chaqueta','abrigo','polera','ropa_deportiva','ropa_casual'))
    or (category = 'lentes' and item_type = 'lentes')
    or (category = 'pulseras' and item_type = 'pulsera')
    or (category = 'cadenas' and item_type = 'cadena')
    or (category = 'relojes' and item_type = 'reloj')
  ),
  constraint estaciones_validas check (
    additional_seasons <@ array['verano','otono','invierno','primavera']::text[]
    and not (main_season = any(additional_seasons))
  ),
  -- La talla de ropa no aplica a accesorios (sus medidas físicas van en notes / perfil).
  constraint talla_solo_ropa check (category = 'ropa' or clothing_size is null)
);
create index if not exists wardrobe_user_season_idx on public.wardrobe_items(user_id, main_season);
create index if not exists wardrobe_user_category_idx on public.wardrobe_items(user_id, category);
create index if not exists wardrobe_user_color_idx on public.wardrobe_items(user_id, color);
create index if not exists wardrobe_additional_seasons_idx on public.wardrobe_items using gin(additional_seasons);

-- ---------- item_images ----------
create table if not exists public.item_images (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null unique references public.wardrobe_items(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  original_path      text not null,
  processed_path     text,
  processing_status  text not null default 'pending' check (processing_status in ('pending','processed','failed','manual')),
  created_at         timestamptz not null default now(),
  constraint rutas_propias check (
    split_part(original_path, '/', 1) = user_id::text
    and (processed_path is null or split_part(processed_path, '/', 1) = user_id::text)
  )
);
create index if not exists item_images_user_idx on public.item_images(user_id);

-- ---------- scans (métricas y costes; solo el servidor escribe) ----------
create table if not exists public.scans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  item_id             uuid references public.wardrobe_items(id) on delete set null,
  processing_time     integer,                      -- ms de la llamada de clasificación
  client_time         integer,                      -- ms totales medidos en el cliente (recorte + IA)
  detected_category   text,
  detected_item_type  text,
  detected_color      text,
  suggested_season    text,
  suggested_additional_seasons text[],
  confidence          numeric(4,3),
  correction_status   text not null default 'pending' check (correction_status in ('pending','accepted','corrected','discarded','failed')),
  corrected_fields    text[] not null default '{}',
  processing_cost     numeric(12,6) not null default 0,  -- USD
  model               text,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  bg_method           text,                          -- local | remove_bg | none
  bg_ok               boolean,
  error               text,
  created_at          timestamptz not null default now()
);
create index if not exists scans_user_month_idx on public.scans(user_id, created_at desc);

-- ---------- subscriptions ----------
create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.users(id) on delete set null,
  buyer_email          text not null check (buyer_email = lower(buyer_email)),
  hotmart_product_id   text not null,
  subscription_key     text not null unique,          -- subscriber.code de Hotmart, o la transacción si no hay
  transaction_id       text not null,                 -- última transacción aplicada
  plan                 text not null default 'desconocido' check (plan in ('mensual','anual','desconocido')),
  subscription_status  text not null check (subscription_status in ('pending','active','past_due','canceled','refunded','chargeback','expired')),
  access_enabled       boolean not null default false,
  current_period_end   timestamptz,
  last_event_at        timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);
create index if not exists subscriptions_email_idx on public.subscriptions(buyer_email);

-- Pagos: una fila por transacción → un evento repetido nunca duplica transacciones.
create table if not exists public.subscription_payments (
  transaction_id   text primary key,
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  event_name       text not null,
  amount           numeric(12,2),
  currency         text,
  recurrence       integer,
  created_at       timestamptz not null default now()
);

-- ---------- hotmart_events (cola: se guarda primero, se procesa después; reintentable) ----------
create table if not exists public.hotmart_events (
  event_id        text primary key,
  event_name      text not null,
  transaction_id  text,
  payload         jsonb not null,      -- payload mínimo, sin documento/teléfono/dirección
  processed       boolean not null default false,
  result          text,
  attempts        integer not null default 0,
  last_error      text,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);
create index if not exists hotmart_events_pending_idx on public.hotmart_events(processed, received_at) where not processed;

-- ---------- audit_logs ----------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.users(id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_user_idx on public.audit_logs(user_id, created_at desc);

-- =====================================================================
-- Funciones
-- =====================================================================

-- updated_at automático
create or replace function public.tocar_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists t_profiles_updated on public.user_profiles;
create trigger t_profiles_updated before update on public.user_profiles for each row execute function public.tocar_updated_at();
drop trigger if exists t_items_updated on public.wardrobe_items;
create trigger t_items_updated before update on public.wardrobe_items for each row execute function public.tocar_updated_at();

-- Acceso real: lo decide el servidor con la suscripción, nunca el navegador.
create or replace function public.has_active_access(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid
      and s.access_enabled
      and s.current_period_end is not null      -- todo acceso tiene fecha de fin: si falla un webhook, vence solo
      and s.current_period_end > now()
  );
$$;
revoke all on function public.has_active_access(uuid) from public, anon;
grant execute on function public.has_active_access(uuid) to authenticated, service_role;

-- Registrar un peso actualiza el peso actual del perfil (mismo usuario, misma transacción).
create or replace function public.peso_a_perfil() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  update public.user_profiles
     set weight = new.weight, weight_unit = new.unit, weight_updated_at = now()
   where user_id = new.user_id
     and (weight_updated_at is null or new.recorded_at >= weight_updated_at::date);
  return new;
end; $$;
drop trigger if exists t_peso_a_perfil on public.weight_history;
create trigger t_peso_a_perfil after insert on public.weight_history for each row execute function public.peso_a_perfil();

-- Alta de usuario: solo con email CONFIRMADO se crea el espejo y se vinculan compras previas por email.
create or replace function public.vincular_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null then return new; end if;
  insert into public.users (id, email) values (new.id, lower(new.email)) on conflict (id) do nothing;
  insert into public.user_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  update public.subscriptions set user_id = new.id, updated_at = now()
    where buyer_email = lower(new.email) and user_id is null;
  insert into public.audit_logs (user_id, action) values (new.id, 'cuenta_confirmada');
  return new;
end; $$;
drop trigger if exists t_vincular_usuario on auth.users;
create trigger t_vincular_usuario after insert or update of email_confirmed_at on auth.users
  for each row execute function public.vincular_usuario();

-- Aplicar el resultado de un evento Hotmart de forma atómica, idempotente y en orden.
create or replace function public.aplicar_suscripcion(
  p_subscription_key text, p_buyer_email text, p_product_id text, p_transaction_id text, p_plan text,
  p_status text, p_access boolean, p_period_end timestamptz, p_event_at timestamptz,
  p_event_name text, p_amount numeric, p_currency text, p_recurrence integer, p_registrar_pago boolean
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_uid uuid;
begin
  select id into v_uid from public.users where email = lower(p_buyer_email);

  insert into public.subscriptions as s (user_id, buyer_email, hotmart_product_id, subscription_key, transaction_id, plan,
    subscription_status, access_enabled, current_period_end, last_event_at)
  values (v_uid, lower(p_buyer_email), p_product_id, p_subscription_key, p_transaction_id, p_plan,
    p_status, p_access, p_period_end, p_event_at)
  on conflict (subscription_key) do nothing
  returning * into v_sub;

  if v_sub.id is null then
    select * into v_sub from public.subscriptions where subscription_key = p_subscription_key for update;
    if p_event_at < v_sub.last_event_at then
      return 'evento_antiguo';      -- llegó tarde: no pisa un estado más nuevo
    end if;
    update public.subscriptions set
      user_id = coalesce(user_id, v_uid),
      transaction_id = p_transaction_id,
      plan = case when p_plan = 'desconocido' then plan else p_plan end,
      subscription_status = p_status,
      access_enabled = p_access,
      -- Nunca acortar un periodo ya pagado salvo reembolso/contracargo.
      current_period_end = case
        when p_status in ('refunded','chargeback') then p_period_end
        when p_period_end is null then current_period_end
        else greatest(coalesce(current_period_end, p_period_end), p_period_end) end,
      last_event_at = p_event_at,
      updated_at = now()
    where id = v_sub.id;
  end if;

  if p_registrar_pago then
    insert into public.subscription_payments (transaction_id, subscription_id, event_name, amount, currency, recurrence)
    values (p_transaction_id, v_sub.id, p_event_name, p_amount, p_currency, p_recurrence)
    on conflict (transaction_id) do nothing;
  end if;

  insert into public.audit_logs (user_id, action, details)
  values (coalesce(v_sub.user_id, v_uid), 'hotmart_' || lower(p_event_name),
          jsonb_build_object('status', p_status, 'access', p_access, 'transaction', p_transaction_id));
  return 'aplicado';
end; $$;
revoke all on function public.aplicar_suscripcion(text,text,text,text,text,text,boolean,timestamptz,timestamptz,text,numeric,text,integer,boolean) from public, anon, authenticated;
grant execute on function public.aplicar_suscripcion(text,text,text,text,text,text,boolean,timestamptz,timestamptz,text,numeric,text,integer,boolean) to service_role;

-- Borrar datos personales (peso, medidas, tallas) sin borrar la cuenta.
create or replace function public.borrar_datos_personales() returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.weight_history where user_id = auth.uid();
  update public.user_profiles set weight = null, weight_updated_at = null, measurements = '{}'::jsonb,
    shirt_size = null, polo_size = null, trouser_size = null, jeans_size = null, shorts_size = null,
    jacket_size = null, blazer_size = null, suit_size = null, sportswear_size = null
  where user_id = auth.uid();
  insert into public.audit_logs (user_id, action) values (auth.uid(), 'datos_personales_borrados');
end; $$;
revoke all on function public.borrar_datos_personales() from public, anon;
grant execute on function public.borrar_datos_personales() to authenticated;

-- =====================================================================
-- RLS: cada usuario solo ve lo suyo. Leer y borrar siempre (privacidad);
-- crear y editar contenido requiere suscripción activa.
-- =====================================================================
alter table public.users                 enable row level security;
alter table public.user_profiles         enable row level security;
alter table public.weight_history        enable row level security;
alter table public.wardrobe_items        enable row level security;
alter table public.item_images           enable row level security;
alter table public.scans                 enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.hotmart_events        enable row level security;
alter table public.audit_logs            enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated using (id = auth.uid());

-- Perfil, peso y medidas: datos personales; editables aun sin suscripción (son del usuario).
drop policy if exists profiles_select on public.user_profiles;
create policy profiles_select on public.user_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists profiles_update on public.user_profiles;
create policy profiles_update on public.user_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists weight_select on public.weight_history;
create policy weight_select on public.weight_history for select to authenticated using (user_id = auth.uid());
drop policy if exists weight_insert on public.weight_history;
create policy weight_insert on public.weight_history for insert to authenticated with check (user_id = auth.uid());
drop policy if exists weight_delete on public.weight_history;
create policy weight_delete on public.weight_history for delete to authenticated using (user_id = auth.uid());

drop policy if exists items_select on public.wardrobe_items;
create policy items_select on public.wardrobe_items for select to authenticated using (user_id = auth.uid());
drop policy if exists items_insert on public.wardrobe_items;
create policy items_insert on public.wardrobe_items for insert to authenticated
  with check (user_id = auth.uid() and public.has_active_access());
drop policy if exists items_update on public.wardrobe_items;
create policy items_update on public.wardrobe_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_active_access());
drop policy if exists items_delete on public.wardrobe_items;
create policy items_delete on public.wardrobe_items for delete to authenticated using (user_id = auth.uid());

drop policy if exists images_select on public.item_images;
create policy images_select on public.item_images for select to authenticated using (user_id = auth.uid());
drop policy if exists images_insert on public.item_images;
create policy images_insert on public.item_images for insert to authenticated
  with check (user_id = auth.uid() and public.has_active_access()
              and exists (select 1 from public.wardrobe_items i where i.id = item_id and i.user_id = auth.uid()));
drop policy if exists images_update on public.item_images;
create policy images_update on public.item_images for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_active_access());
drop policy if exists images_delete on public.item_images;
create policy images_delete on public.item_images for delete to authenticated using (user_id = auth.uid());

drop policy if exists scans_select on public.scans;
create policy scans_select on public.scans for select to authenticated using (user_id = auth.uid());

drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions for select to authenticated using (user_id = auth.uid());

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (user_id = auth.uid());
-- subscription_payments y hotmart_events: sin políticas → solo service_role.

-- =====================================================================
-- Storage privado: wardrobe/<user_id>/<item_id>/original.jpg | processed.webp
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wardrobe_read on storage.objects;
create policy wardrobe_read on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists wardrobe_delete on storage.objects;
create policy wardrobe_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists wardrobe_insert on storage.objects;
create policy wardrobe_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text and public.has_active_access());
drop policy if exists wardrobe_update on storage.objects;
create policy wardrobe_update on storage.objects for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text and public.has_active_access());

-- Vista de costes para el administrador (solo service_role / SQL Editor).
create or replace view public.admin_costes_mensuales with (security_invoker = true) as
select date_trunc('month', created_at) as mes,
       count(*)                                            as intentos,
       count(*) filter (where error is null)               as exitosos,
       round(sum(processing_cost), 4)                      as coste_usd,
       round(sum(processing_cost) / nullif(count(*), 0), 6) as coste_por_intento,
       round(sum(processing_cost) / nullif(count(*) filter (where error is null), 0), 6) as coste_por_exitoso,
       percentile_cont(0.5) within group (order by processing_time)  as latencia_p50_ms,
       percentile_cont(0.95) within group (order by processing_time) as latencia_p95_ms,
       round(100.0 * count(*) filter (where correction_status = 'corrected')
             / nullif(count(*) filter (where correction_status in ('accepted','corrected')), 0), 1) as pct_corregidos
from public.scans group by 1 order by 1 desc;
revoke all on public.admin_costes_mensuales from anon, authenticated;
