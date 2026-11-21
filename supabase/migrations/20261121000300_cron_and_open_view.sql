-- Ingesta cada 12 hores (hores en UTC: 06:05–06:20 i 18:05–18:20), esglaonada per font
select cron.schedule('lic-ingest-placsp',        '5 6,18 * * *',  $$select public.lic_trigger_ingest('placsp')$$);
select cron.schedule('lic-ingest-placsp-agg',    '10 6,18 * * *', $$select public.lic_trigger_ingest('placsp_agg')$$);
select cron.schedule('lic-ingest-placsp-menors', '15 6,18 * * *', $$select public.lic_trigger_ingest('placsp_menors')$$);
select cron.schedule('lic-ingest-ted',           '20 6,18 * * *', $$select public.lic_trigger_ingest('ted')$$);

-- Licitacions obertes i dins de termini, per revisar
create or replace view public.lic_open with (security_invoker = true) as
  select id, source, l1_score, l1_reason, lines, title, buyer, amount, currency, deadline, status, cpv, url, first_seen
  from public.lic_tenders
  where (status in ('PUB','PRE') or status ~ '^(cn|pin)') and (deadline is null or deadline > now())
  order by l1_score desc, deadline nulls last;
