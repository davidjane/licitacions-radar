// lic-ingest: POST {"source": "ted" | "placsp" | "placsp_agg" | "placsp_menors", "max_pages"?: n}
import { createClient } from "npm:@supabase/supabase-js@2";
import { ingestPlacsp } from "./placsp.ts";
import { ingestTed } from "./ted.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function config<T>(key: string): Promise<T | null> {
  const { data } = await db.from("lic_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

// Autenticació pròpia: capçalera x-lic-secret contra el secret guardat al Vault (verify_jwt desactivat)
let secret: string | null = null;
async function authorized(req: Request): Promise<boolean> {
  if (!secret) secret = ((await db.rpc("lic_cron_secret")).data as string) ?? null;
  return Boolean(secret) && req.headers.get("x-lic-secret") === secret;
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { source = "ted", max_pages } = await req.json().catch(() => ({}));
  const { data: run } = await db.from("lic_ingest_runs").insert({ source }).select("id").single();
  const finish = (patch: Record<string, unknown>) =>
    db.from("lic_ingest_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run!.id);

  try {
    const { data: terms } = await db.from("lic_terms").select("term,line,kind").eq("active", true);
    const { data: cpvRules } = await db.from("lic_cpv").select("prefix,line");
    let out: { rows: Record<string, unknown>[]; pages: number; seen: number; truncated: boolean; newest?: string | null };

    if (source === "ted") {
      const queries = (await config<never[]>("ted_queries")) ?? [];
      out = await ingestTed(queries, terms ?? [], cpvRules ?? [], max_pages ?? 8);
    } else {
      const feeds = (await config<Record<string, string>>("placsp_feeds")) ?? {};
      if (!feeds[source]) throw new Error(`Font desconeguda: ${source}`);
      const wmKey = `watermark:${source}`;
      const watermark = await config<string>(wmKey);
      // Primera execució (sense watermark): només 2 pàgines per no descarregar tot l'històric
      const pagesCap = max_pages ?? (watermark ? 10 : 2);
      out = await ingestPlacsp(source, feeds[source], watermark, terms ?? [], cpvRules ?? [], pagesCap);
      // Si s'ha truncat no avancem el watermark: la propera execució ho torna a intentar
      if (out.newest && !out.truncated) await db.from("lic_config").upsert({ key: wmKey, value: out.newest });
    }

    for (let i = 0; i < out.rows.length; i += 200) {
      const { error } = await db
        .from("lic_tenders")
        .upsert(out.rows.slice(i, i + 200), { onConflict: "source,source_id" });
      if (error) throw new Error(error.message);
    }
    const summary = {
      pages: out.pages,
      entries_seen: out.seen,
      entries_matched: out.rows.length,
      truncated: out.truncated,
    };
    await finish(summary);
    return Response.json({ ok: true, source, ...summary });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finish({ error });
    return Response.json({ ok: false, source, error }, { status: 500 });
  }
});
