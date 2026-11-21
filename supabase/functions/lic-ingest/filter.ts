// Capa 1: filtre barat per termes + CPV. Tot el diccionari viu a la BD (lic_terms, lic_cpv).

export type Term = { term: string; line: string; kind: "brand" | "brand_ambiguous" | "generic" };
export type Cpv = { prefix: string; line: string };
export type Match = { score: number; reason: string; terms: string[]; lines: string[] };

export function normalize(s: string): string {
  return (
    " " +
    (s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() +
    " "
  );
}

const IT_CPV = /^(72|48|80533)/;

export function classify(text: string, cpvs: string[], terms: Term[], cpvRules: Cpv[]): Match | null {
  const n = normalize(text);
  const hits = terms.filter((t) => n.includes(" " + t.term + " "));
  const cpvHits = cpvRules.filter((r) => cpvs.some((c) => c.startsWith(r.prefix)));
  const itCpv = cpvs.some((c) => IT_CPV.test(c));

  const brand = hits.filter((h) => h.kind === "brand");
  const ambiguous = hits.filter((h) => h.kind === "brand_ambiguous");
  const generic = hits.filter((h) => h.kind === "generic");

  let score = 0;
  let reason = "";
  if (brand.length) {
    score = 95;
    reason = "marca";
  } else if (ambiguous.length && (itCpv || generic.length)) {
    score = 85;
    reason = "marca ambigua amb context TI";
  } else if (generic.length && itCpv) {
    score = 70;
    reason = "terme + CPV TI";
  } else if (cpvHits.some((c) => c.line !== "ti")) {
    score = 50;
    reason = "només CPV";
  } else if (generic.length) {
    score = 45;
    reason = "només terme";
  } else if (ambiguous.length) {
    score = 35;
    reason = "marca ambigua sense context";
  } else if (cpvHits.length) {
    score = 30;
    reason = "CPV TI genèric";
  } else {
    return null;
  }

  const lines = [...new Set([...hits.map((h) => h.line), ...cpvHits.map((c) => c.line)])];
  return { score, reason, terms: hits.map((h) => h.term), lines };
}
