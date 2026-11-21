-- Seguiment de quines licitacions ja s'han avisat a Slack (#licitacions)
alter table public.lic_tenders add column if not exists notified_at timestamptz;

-- Licitacions obertes pendents d'avisar, amb la línia ja formatada: «• [títol](enllaç) — ens»
create or replace view public.lic_to_notify with (security_invoker = true) as
  select id, source, l1_score, deadline,
         '• [' || replace(replace(left(coalesce(nullif(title, ''), 'Sense títol'), 140), '[', '('), ']', ')') || '](' || url || ') — ' || coalesce(left(buyer, 80), 'Ens desconegut') as line
  from public.lic_tenders
  where notified_at is null
    and url is not null
    and (status in ('PUB','PRE') or status ~ '^(cn|pin)')
    and (deadline is null or deadline > now());
