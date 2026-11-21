// Ingesta dels feeds ATOM de la PLACSP (format CODICE).
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { classify, type Cpv, type Term } from "./filter.ts";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) =>
    ["entry", "link", "RequiredCommodityClassification", "ProcurementProjectLot"].includes(name),
});

// deno-lint-ignore no-explicit-any
const txt = (v: any): string | null =>
  v == null ? null : typeof v === "object" ? (v["#text"] != null ? String(v["#text"]) : null) : String(v);

// deno-lint-ignore no-explicit-any
function toRow(source: string, e: any, terms: Term[], cpvRules: Cpv[]) {
  const cfs = e.ContractFolderStatus ?? {};
  const pp = cfs.ProcurementProject ?? {};
  const title = txt(pp.Name) ?? txt(e.title) ?? "";
  const summary = txt(e.summary) ?? "";
  const cpvs = new Set<string>();
  for (const c of pp.RequiredCommodityClassification ?? []) {
    const code = txt(c.ItemClassificationCode);
    if (code) cpvs.add(code);
  }
  for (const lot of cfs.ProcurementProjectLot ?? []) {
    for (const c of lot.ProcurementProject?.RequiredCommodityClassification ?? []) {
      const code = txt(c.ItemClassificationCode);
      if (code) cpvs.add(code);
    }
  }
  const cpv = [...cpvs];
  const lotNames = (cfs.ProcurementProjectLot ?? [])
    // deno-lint-ignore no-explicit-any
    .map((l: any) => txt(l.ProcurementProject?.Name) ?? "")
    .join(" ");
  const m = classify(`${title} ${lotNames}`, cpv, terms, cpvRules);
  if (!m) return null;

  const dl = cfs.TenderingProcess?.TenderSubmissionDeadlinePeriod;
  const endDate = txt(dl?.EndDate);
  const endTime = txt(dl?.EndTime) ?? "23:59:59";
  const amount = pp.BudgetAmount?.TaxExclusiveAmount ?? pp.BudgetAmount?.EstimatedOverallContractAmount;
  const id = txt(e.id);
  if (!id) return null;

  return {
    source,
    source_id: id,
    expedient: txt(cfs.ContractFolderID),
    title,
    summary,
    buyer: txt(cfs.LocatedContractingParty?.Party?.PartyName?.Name),
    country: "ES",
    cpv,
    amount: txt(amount) ? Number(txt(amount)) : null,
    currency: amount?.["@_currencyID"] ?? "EUR",
    status: txt(cfs.ContractFolderStatusCode),
    deadline: endDate ? `${endDate.slice(0, 10)}T${endTime.slice(0, 8)}+01:00` : null,
    updated_at_source: txt(e.updated),
    // deno-lint-ignore no-explicit-any
    url: (e.link ?? []).map((l: any) => l["@_href"]).find(Boolean) ?? null,
    matched_terms: m.terms,
    lines: m.lines,
    l1_score: m.score,
    l1_reason: m.reason,
    last_seen: new Date().toISOString(),
  };
}

export async function ingestPlacsp(
  source: string,
  feedUrl: string,
  watermark: string | null,
  terms: Term[],
  cpvRules: Cpv[],
  maxPages: number,
) {
  const rows = new Map<string, NonNullable<ReturnType<typeof toRow>>>();
  let url: string | null = feedUrl;
  let pages = 0;
  let seen = 0;
  let newest = watermark;
  let reachedWatermark = false;

  while (url && pages < maxPages && !reachedWatermark) {
    const res: Response = await fetch(url, { headers: { "User-Agent": "VolcanicLicitacionsRadar/0.1" } });
    if (!res.ok) throw new Error(`PLACSP ${res.status} a ${url}`);
    const feed = parser.parse(await res.text()).feed ?? {};
    pages++;
    for (const e of feed.entry ?? []) {
      const updated = txt(e.updated);
      if (!updated) continue;
      if (watermark && new Date(updated) <= new Date(watermark)) {
        reachedWatermark = true;
        continue;
      }
      seen++;
      if (!newest || new Date(updated) > new Date(newest)) newest = updated;
      const row = toRow(source, e, terms, cpvRules);
      if (!row) continue;
      const prev = rows.get(row.source_id);
      if (!prev || new Date(row.updated_at_source!) > new Date(prev.updated_at_source!)) {
        rows.set(row.source_id, row);
      }
    }
    // deno-lint-ignore no-explicit-any
    url = (feed.link ?? []).find((l: any) => l["@_rel"] === "next")?.["@_href"] ?? null;
  }

  return {
    rows: [...rows.values()],
    pages,
    seen,
    newest,
    truncated: Boolean(watermark) && !reachedWatermark && Boolean(url),
  };
}
