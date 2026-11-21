-- Infraestructura per disparar la ingesta des de la base de dades (pg_net + pg_cron)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Secret compartit entre la BD i l'edge function; es genera aquí i no surt mai de la BD
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'lic_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'lic_cron_secret');
  end if;
end $$;

create or replace function public.lic_cron_secret() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'lic_cron_secret'
$$;
revoke all on function public.lic_cron_secret() from public, anon, authenticated;
grant execute on function public.lic_cron_secret() to service_role;

create or replace function public.lic_trigger_ingest(p_source text, p_max_pages int default null) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := (select value #>> '{}' from public.lic_config where key = 'function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-lic-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lic_cron_secret')
    ),
    body := jsonb_strip_nulls(jsonb_build_object('source', p_source, 'max_pages', p_max_pages)),
    timeout_milliseconds := 140000
  )
$$;
revoke all on function public.lic_trigger_ingest(text, int) from public, anon, authenticated;
