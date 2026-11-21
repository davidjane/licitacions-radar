-- Els projectes nous de Supabase no donen permisos automàtics als rols de l'API sobre taules noves
grant usage on schema public to service_role;
grant select, insert, update, delete on public.lic_tenders, public.lic_terms, public.lic_cpv, public.lic_config, public.lic_ingest_runs to service_role;
