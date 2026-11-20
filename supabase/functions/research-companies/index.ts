// One-time job: company profiles researched on the web by Claude (web search tool), for listed companies that open data
// (Wikidata / Wikipedia) doesn't cover. Facts only, each backed by a cited source; null when not found (nothing invented).
// Only empty fields are filled; low-confidence results are not written. Body: {assetIds: string[]} (2-3 per call).
import { MODELS, claude } from '../_shared/ai.ts';
import { admin, audit, handler, json, requireService } from '../_shared/runtime.ts';

type Profile = {
  found: boolean; confidence: 'high' | 'medium' | 'low'; official_name: string | null;
  description_fr: string | null; description_en: string | null; activity_fr: string | null; activity_en: string | null;
  website: string | null; headquarters: string | null; founded_year: number | null; employees: number | null;
  ceo: string | null; chairman: string | null; shareholders: { holder: string; pct: number | null; as_of: string | null }[];
  sources: { url: string; title: string | null }[];
};
const MARKET: Record<string, string> = { BRVM: 'BRVM (Bourse régionale des valeurs mobilières, Abidjan, UEMOA)', BVMAC: 'BVMAC (Bourse des valeurs mobilières de l’Afrique centrale, Douala)', NGX: 'Nigerian Exchange (NGX, Lagos)' };
const COUNTRY: Record<string, string> = { CI: "Côte d'Ivoire", SN: 'Sénégal', BF: 'Burkina Faso', BJ: 'Bénin', ML: 'Mali', NE: 'Niger', TG: 'Togo', NG: 'Nigeria', CM: 'Cameroun', GA: 'Gabon', GQ: 'Guinée équatoriale', CG: 'Congo', TD: 'Tchad' };

function parse(text: string): Profile | null {
  const m = /\{[\s\S]*\}/.exec(text.replace(/```json|```/g, ''));
  if (!m) return null;
  try { return JSON.parse(m[0]) as Profile; } catch { return null; }
}

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { assetIds = [] } = (await req.json().catch(() => ({}))) as { assetIds?: string[] };
  const { data: assets } = await db.from('assets').select('id, ticker, name, market, country, website, headquarters, founded_year, employees, description_fr, description_en, activity_fr, activity_en, sectors(name_fr)').in('id', assetIds.slice(0, 3));
  const log: Record<string, unknown>[] = [];
  for (const a of assets ?? []) {
    const prompt = `Recherche sur internet des informations factuelles et vérifiables sur cette société cotée :
- Nom de cotation : ${a.name} (ticker ${a.ticker})
- Bourse : ${MARKET[a.market] ?? a.market}
- Pays : ${a.country ? COUNTRY[a.country] ?? a.country : 'inconnu'}
- Secteur : ${(a.sectors as unknown as { name_fr: string } | null)?.name_fr ?? 'inconnu'}
Vérifie d'abord que tu as identifié la BONNE société (celle cotée sous ce ticker sur cette bourse, pas une homonyme ni sa maison mère). Privilégie le site officiel de la société, le site de la bourse (brvm.org, ngxgroup.com, bvm-ac.org), les rapports annuels, les régulateurs (AMF-UMOA, SEC Nigeria, COSUMAF) et la presse financière reconnue.
Réponds UNIQUEMENT par un objet JSON (sans texte autour) :
{"found": bool, "confidence": "high"|"medium"|"low", "official_name": str|null,
 "description_fr": str|null (3 à 4 phrases rédigées par toi : activité, marchés, position, faits marquants — uniquement des faits trouvés),
 "description_en": str|null (même contenu en anglais), "activity_fr": str|null (≤ 15 mots), "activity_en": str|null,
 "website": str|null (site officiel), "headquarters": str|null ("Ville, Pays"), "founded_year": int|null, "employees": int|null,
 "ceo": str|null, "chairman": str|null,
 "shareholders": [{"holder": str, "pct": number|null, "as_of": "YYYY-MM-DD"|null}] (actionnaires principaux publiés, sinon []),
 "sources": [{"url": str, "title": str|null}] (les pages réellement utilisées)}
Tu DOIS lancer au moins une recherche web avant de répondre (ne réponds jamais de mémoire). Règles : n'invente rien ; mets null quand l'information n'est pas trouvée ou incertaine ; confidence "low" si l'identification de la société est douteuse.`;
    try {
      const messages: any[] = [{ role: 'user', content: prompt }];
      let res: any = null;
      for (let k = 0; k < 4; k++) {
        res = await claude().messages.create({
          model: MODELS.deep, max_tokens: 4000, output_config: { effort: 'medium' },
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }], messages,
        } as never);
        if (res.stop_reason !== 'pause_turn') break;
        messages.splice(1, messages.length - 1, { role: 'assistant', content: res.content });
      }
      const text = (res?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      const p = parse(text);
      const searches = (res?.usage?.server_tool_use?.web_search_requests as number | undefined) ?? null;
      await audit('system:research', 'company_research', 'assets', a.id, { model: res?.model, usage: res?.usage });
      if (!p || !p.found || p.confidence === 'low') {
        // No search performed: leave it for a later retry instead of marking it inconclusive.
        if (!searches) { log.push({ asset: a.id, result: 'retry (no search)', searches }); continue; }
        await db.from('assets').update({ profile_source: 'web_research_inconclusive', profile_confidence: p?.confidence ?? null, profile_updated_at: new Date().toISOString() }).eq('id', a.id);
        log.push({ asset: a.id, result: p ? `not_written (${p.found ? p.confidence : 'not found'})` : 'unparsable', searches });
        continue;
      }
      const sources = (p.sources ?? []).filter((s) => /^https?:\/\//.test(s.url)).slice(0, 8);
      const patch: Record<string, unknown> = { profile_source: 'Recherche web assistée par IA — sources citées', profile_source_url: sources[0]?.url ?? null, profile_sources: sources, profile_confidence: p.confidence, profile_updated_at: new Date().toISOString() };
      const fill = (k: string, v: unknown) => { if ((a as Record<string, unknown>)[k] == null && v != null && v !== '') patch[k] = v; };
      fill('description_fr', p.description_fr); fill('description_en', p.description_en); fill('activity_fr', p.activity_fr); fill('activity_en', p.activity_en);
      fill('website', p.website && /^https?:\/\//.test(p.website) ? p.website : null); fill('headquarters', p.headquarters);
      fill('founded_year', p.founded_year && p.founded_year > 1800 && p.founded_year <= new Date().getUTCFullYear() ? p.founded_year : null);
      fill('employees', p.employees && p.employees > 0 ? Math.round(p.employees) : null);
      { const { error } = await db.from('assets').update(patch).eq('id', a.id); if (error) throw new Error(`assets: ${error.message}`); }
      const execs = [p.ceo ? { person: p.ceo, role: 'Directeur général' } : null, p.chairman ? { person: p.chairman, role: 'Président du conseil d’administration' } : null].filter(Boolean) as { person: string; role: string }[];
      const { count: hasExec } = await db.from('asset_executives').select('*', { count: 'exact', head: true }).eq('asset_id', a.id);
      const errs: string[] = [];
      if (execs.length && !hasExec) {
        const { error } = await db.from('asset_executives').insert(execs.map((x) => ({ asset_id: a.id, ...x, source: 'Recherche web' })));
        if (error) errs.push(`execs: ${error.message}`);
      }
      const seen = new Set<string>();
      const holders = (p.shareholders ?? []).filter((h) => h.holder && (h.pct == null || (h.pct > 0 && h.pct <= 100)) && !seen.has(h.holder.trim().toLowerCase()) && seen.add(h.holder.trim().toLowerCase())).slice(0, 8);
      const { count: hasHold } = await db.from('asset_shareholders').select('*', { count: 'exact', head: true }).eq('asset_id', a.id);
      if (holders.length && !hasHold) {
        const { error } = await db.from('asset_shareholders').insert(holders.map((h) => ({ asset_id: a.id, holder: h.holder.trim(), pct: h.pct, as_of: h.as_of && /^\d{4}-\d{2}-\d{2}$/.test(h.as_of) ? h.as_of : null, source: 'Recherche web' })));
        if (error) errs.push(`holders: ${error.message}`);
      }
      log.push({ asset: a.id, result: errs.length ? `error: ${errs.join('; ')}` : 'written', confidence: p.confidence, fields: Object.keys(patch).filter((k) => !k.startsWith('profile')), execs: execs.length, holders: holders.length, sources: sources.length, searches });
    } catch (e) {
      log.push({ asset: a.id, result: `error: ${String((e as Error).message ?? e).slice(0, 160)}` });
    }
  }
  await db.from('ingestion_runs').insert({ job: 'research_companies', status: log.some((l) => String(l.result).startsWith('error')) ? 'partial' : 'ok', rows_written: log.filter((l) => l.result === 'written').length, attempts: log, finished_at: new Date().toISOString(), source_used: 'claude+web_search' });
  return json({ log });
}));
