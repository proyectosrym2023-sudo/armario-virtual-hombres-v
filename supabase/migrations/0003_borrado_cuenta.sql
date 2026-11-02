-- Corrección: al borrar una cuenta (auth.users → cascada), el trigger de peso se ejecutaba con el rol
-- supabase_auth_admin, sin permisos sobre public.*, y revertía TODO el borrado ("Database error deleting user").
-- SECURITY DEFINER es seguro aquí: solo lee/escribe filas del mismo user_id de la fila que disparó el trigger
-- (esa fila ya pasó la RLS al insertarse/borrarse).
create or replace function public.peso_a_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
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
revoke all on function public.peso_a_perfil() from public, anon, authenticated;
