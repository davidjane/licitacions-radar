-- Licitacions Radar — esquema inicial (prefix lic_ perquè pugui conviure amb altres taules)

create table if not exists public.lic_tenders (
  id                bigint generated always as identity primary key,
  source            text not null,            -- placsp | placsp_agg | placsp_menors | ted | pscp
  source_id         text not null,            -- id estable a la font
  expedient         text,
  title             text,
  summary           text,
  buyer             text,
  country           text,
  cpv               text[] not null default '{}',
  amount            numeric,
  currency          text,
  status            text,                     -- PLACSP: PRE, PUB, EV, ADJ, RES, ANUL
  deadline          timestamptz,
  published_at      timestamptz,
  updated_at_source timestamptz,
  url               text,
  matched_terms     text[] not null default '{}',
  lines             text[] not null default '{}',  -- asana | pipedrive | notion | claude | software | web | formacio | ti
  l1_score          int not null default 0,
  l1_reason         text,
  first_seen        timestamptz not null default now(),
  last_seen         timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists lic_tenders_score_idx on public.lic_tenders (l1_score desc, first_seen desc);
create index if not exists lic_tenders_deadline_idx on public.lic_tenders (deadline);

-- Diccionari de termes (ja normalitzats: minúscules, sense accents ni puntuació)
create table if not exists public.lic_terms (
  term      text primary key,
  line      text not null,
  kind      text not null check (kind in ('brand', 'brand_ambiguous', 'generic')),
  active    boolean not null default true
);

-- Prefixos CPV d'interès
create table if not exists public.lic_cpv (
  prefix text primary key,
  line   text not null,
  note   text
);

create table if not exists public.lic_config (
  key   text primary key,
  value jsonb not null
);

create table if not exists public.lic_ingest_runs (
  id              bigint generated always as identity primary key,
  source          text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  pages           int default 0,
  entries_seen    int default 0,
  entries_matched int default 0,
  truncated       boolean default false,
  error           text
);

-- Només hi accedeix el service role (edge functions); cap política = cap accés públic
alter table public.lic_tenders     enable row level security;
alter table public.lic_terms       enable row level security;
alter table public.lic_cpv         enable row level security;
alter table public.lic_config      enable row level security;
alter table public.lic_ingest_runs enable row level security;

insert into public.lic_terms (term, line, kind) values
  ('asana', 'asana', 'brand'),
  ('pipedrive', 'pipedrive', 'brand'),
  ('anthropic', 'claude', 'brand'),
  ('claude code', 'claude', 'brand'),
  ('claude enterprise', 'claude', 'brand'),
  ('notion', 'notion', 'brand_ambiguous'),
  ('claude', 'claude', 'brand_ambiguous'),
  -- gestió de projectes / treball
  ('gestion de proyectos', 'asana', 'generic'),
  ('gestio de projectes', 'asana', 'generic'),
  ('gestion de tareas', 'asana', 'generic'),
  ('gestio de tasques', 'asana', 'generic'),
  ('gestion del trabajo', 'asana', 'generic'),
  ('work management', 'asana', 'generic'),
  ('project management software', 'asana', 'generic'),
  -- CRM
  ('crm', 'pipedrive', 'generic'),
  ('gestion de relaciones con clientes', 'pipedrive', 'generic'),
  ('gestio de relacions amb clients', 'pipedrive', 'generic'),
  ('customer relationship management', 'pipedrive', 'generic'),
  -- coneixement
  ('gestion del conocimiento', 'notion', 'generic'),
  ('gestio del coneixement', 'notion', 'generic'),
  ('base de conocimiento', 'notion', 'generic'),
  ('base de coneixement', 'notion', 'generic'),
  ('wiki corporativa', 'notion', 'generic'),
  -- IA
  ('inteligencia artificial generativa', 'claude', 'generic'),
  ('intel ligencia artificial generativa', 'claude', 'generic'),
  ('ia generativa', 'claude', 'generic'),
  ('generative ai', 'claude', 'generic'),
  ('asistente de ia', 'claude', 'generic'),
  ('assistent d ia', 'claude', 'generic'),
  ('asistentes de inteligencia artificial', 'claude', 'generic'),
  ('modelos de lenguaje', 'claude', 'generic'),
  ('models de llenguatge', 'claude', 'generic'),
  ('llm', 'claude', 'generic'),
  ('chatbot', 'claude', 'generic'),
  -- software a mida
  ('desarrollo de software', 'software', 'generic'),
  ('desenvolupament de programari', 'software', 'generic'),
  ('desenvolupament de software', 'software', 'generic'),
  ('desarrollo de aplicaciones', 'software', 'generic'),
  ('desenvolupament d aplicacions', 'software', 'generic'),
  ('software a medida', 'software', 'generic'),
  ('programari a mida', 'software', 'generic'),
  ('aplicacion web', 'software', 'generic'),
  ('aplicacio web', 'software', 'generic'),
  ('software development', 'software', 'generic'),
  -- web
  ('desarrollo web', 'web', 'generic'),
  ('desenvolupament web', 'web', 'generic'),
  ('diseno web', 'web', 'generic'),
  ('disseny web', 'web', 'generic'),
  ('pagina web', 'web', 'generic'),
  ('sitio web', 'web', 'generic'),
  ('lloc web', 'web', 'generic'),
  ('portal web', 'web', 'generic'),
  ('website', 'web', 'generic')
on conflict (term) do nothing;

insert into public.lic_cpv (prefix, line, note) values
  ('48331', 'asana', 'Paquets de software de gestió de projectes'),
  ('48445', 'pipedrive', 'Paquets de software CRM'),
  ('722', 'software', 'Programació de software i consultoria'),
  ('72413', 'web', 'Disseny de llocs web'),
  ('7242', 'web', 'Serveis de desenvolupament d''Internet'),
  ('80533', 'formacio', 'Formació informàtica'),
  ('72000000', 'ti', 'Serveis TI (codi genèric)')
on conflict (prefix) do nothing;

insert into public.lic_config (key, value) values
  ('placsp_feeds', '{
     "placsp":        "https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom",
     "placsp_agg":    "https://contrataciondelestado.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom",
     "placsp_menors": "https://contrataciondelestado.es/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes.atom"
   }'::jsonb),
  ('ted_queries', '[
     {"label": "marques-ue", "base_score": 80, "lines": [],
      "query": "publication-date>=today(-3) AND FT~(asana OR pipedrive OR anthropic)"},
     {"label": "cpv-es", "base_score": 0, "lines": [],
      "query": "publication-date>=today(-3) AND buyer-country=ESP AND classification-cpv IN (722* 72413* 7242* 48331* 48445* 80533*)"}
   ]'::jsonb)
on conflict (key) do nothing;
