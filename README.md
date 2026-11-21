# Licitacions Radar

Sistema propi de Volcanic per detectar licitacions públiques rellevants a Espanya i la UE
(Asana, Pipedrive, Notion, Claude, desenvolupament de software i web).

## Estat

Prototip de la capa 1 (ingesta + filtre per termes i CPV). **Encara no desplegat ni provat contra les fonts reals.**

## Fonts

| Font | Accés | Estat |
|---|---|---|
| PLACSP (perfils, agregades, contractes menors) | Feeds ATOM / CODICE | Codi escrit, URL per verificar |
| TED | Search API v3 (anònima) | Codi escrit, sintaxi de consulta per verificar |
| PSCP (Catalunya) | API Socrata | Pendent |

## Estructura

- `supabase/migrations/` — esquema: `lic_tenders`, `lic_terms`, `lic_cpv`, `lic_config`, `lic_ingest_runs`
- `supabase/functions/lic-ingest/` — edge function d'ingesta
  - `filter.ts` — puntuació de la capa 1 (termes + CPV)
  - `placsp.ts` — lectura dels feeds ATOM amb watermark i deduplicació
  - `ted.ts` — consultes a TED (definides a `lic_config.ted_queries`)

Els termes, els prefixos CPV, les URL dels feeds i les consultes de TED viuen a la base de dades:
es calibren sense redesplegar.

## Ús

```
POST /functions/v1/lic-ingest   {"source": "ted" | "placsp" | "placsp_agg" | "placsp_menors"}
```

## Full de ruta

1. Desplegar a Supabase i validar la ingesta amb dades reals
2. Afegir la PSCP
3. Lectura de plecs i classificació amb Claude (capa 2 i 3)
4. Resum diari a Slack i creació de leads a Pipedrive
