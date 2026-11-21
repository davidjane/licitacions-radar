// Ingesta de TED via Search API v3 (anònima). Les consultes viuen a lic_config.ted_queries.
import { classify, type Cpv, type Term } from "./filter.ts";

const ENDPOINT = "https://api.ted.europa.eu/v3/notices/search";
const FIELDS = [
  "publication-number",
  "notice-title",
  "buyer-name",
  "buyer-country",
  "classification-cpv",
  "publication-date",
  "notice-type",
  "deadline-receipt-tender-date-lot",
];

export type TedQuery = { label: string; query: string; base_score: number; lines: string[] };

// Els camps de TED arriben com a string, llista o objecte multilingüe {spa: ..., eng: ...}
// deno-lint-ignore no-explicit-any
function pick(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? pick(v[0]) : null;
  for (const lang of ["spa", "cat", "eng", "fra"]) if (v[lang] != null) return pick(v[lang]);
  const first = Object.values(v)[0];
  return first == null ? null : pick(first);
}
// deno-lint-ignore no-explicit-any
const list = (v: any): string[] => (v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

export async function ingestTed(queries: TedQuery[], terms: Term[], cpvRules: Cpv[], maxPages: number) {
  const rows = new Map<string, Record<string, unknown>>();
  let pages = 0;
  let seen = 0;
  let truncated = false;

  for (const q of queries) {
    let token: string | undefined;
    for (let i = 0; i < maxPages; i++) {
      const body: Record<string, unknown> = {
        query: q.query,
        fields: FIELDS,
        limit: 250,
        paginationMode: "ITERATION",
      };
      if (token) body.iterationNextToken = token;
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`TED ${res.status} [${q.label}]: ${(await res.text()).slice(0, 500)}`);
      const data = await res.json();
      pages++;
      const notices = data.notices ?? [];
      for (const n of notices) {
        seen++;
        const pub = pick(n["publication-number"]);
        if (!pub) continue;
        // Només anuncis de licitació (cn-*) i anuncis previs (pin-*); fora adjudicacions i modificacions
        if (!/^(cn|pin)/.test(pick(n["notice-type"]) ?? "")) continue;
        // El títol de TED ve com "País – descripció del CPV – títol real": ens quedem amb el títol real,
        // si no, la descripció del CPV dispara falsos positius del diccionari
        const rawTitle = pick(n["notice-title"]) ?? "";
        const parts = rawTitle.split(" – ");
        const title = parts.length >= 3 ? parts.slice(2).join(" – ") : rawTitle;
        const cpv = [...new Set(list(n["classification-cpv"]))];
        const m = classify(title, cpv, terms, cpvRules);
        const score = Math.max(m?.score ?? 0, q.base_score);
        if (!score) continue;
        const prev = rows.get(pub);
        if (prev && (prev.l1_score as number) >= score) continue;
        const pubDate = pick(n["publication-date"]);
        const deadline = pick(n["deadline-receipt-tender-date-lot"]);
        rows.set(pub, {
          source: "ted",
          source_id: pub,
          title,
          buyer: pick(n["buyer-name"]),
          country: pick(n["buyer-country"]),
          cpv,
          status: pick(n["notice-type"]),
          deadline: deadline && !isNaN(Date.parse(deadline)) ? new Date(deadline).toISOString() : null,
          published_at: pubDate && !isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : null,
          url: `https://ted.europa.eu/en/notice/-/detail/${pub}`,
          matched_terms: m?.terms ?? [],
          lines: [...new Set([...(m?.lines ?? []), ...q.lines])],
          l1_score: score,
          l1_reason: m && m.score >= q.base_score ? m.reason : `consulta TED: ${q.label}`,
          last_seen: new Date().toISOString(),
        });
      }
      token = data.iterationNextToken;
      if (!token || notices.length < 250) break;
      if (i === maxPages - 1) truncated = true;
    }
  }
  return { rows: [...rows.values()], pages, seen, truncated };
}
