-- Correcciones encontradas por las pruebas de integración (2026-11-01).

-- 1) El peso actual del perfil = el registro más reciente por FECHA DE REGISTRO (no por la hora del servidor en UTC).
--    También se recalcula al BORRAR un registro del historial.
create or replace function public.peso_a_perfil() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := coalesce(new.user_id, old.user_id);
  v_ult record;
begin
  select weight, unit, created_at into v_ult
    from public.weight_history where user_id = v_uid
    order by recorded_at desc, created_at desc limit 1;
  update public.user_profiles
     set weight = v_ult.weight,
         weight_unit = coalesce(v_ult.unit, weight_unit),
         weight_updated_at = v_ult.created_at
   where user_id = v_uid;
  return null;
end; $$;
drop trigger if exists t_peso_a_perfil on public.weight_history;
create trigger t_peso_a_perfil after insert or delete on public.weight_history
  for each row execute function public.peso_a_perfil();

-- 2) Borrar datos personales debe poder escribir la auditoría: SECURITY DEFINER, limitado SIEMPRE a auth.uid().
create or replace function public.borrar_datos_personales() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'No autenticado' using errcode = '42501'; end if;
  delete from public.weight_history where user_id = v_uid;
  update public.user_profiles set weight = null, weight_updated_at = null, measurements = '{}'::jsonb,
    shirt_size = null, polo_size = null, trouser_size = null, jeans_size = null, shorts_size = null,
    jacket_size = null, blazer_size = null, suit_size = null, sportswear_size = null
  where user_id = v_uid;
  insert into public.audit_logs (user_id, action) values (v_uid, 'datos_personales_borrados');
end; $$;
revoke all on function public.borrar_datos_personales() from public, anon;
grant execute on function public.borrar_datos_personales() to authenticated;
