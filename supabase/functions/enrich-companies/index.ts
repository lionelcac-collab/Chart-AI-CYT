// Job: company profiles from open data — Wikidata (CC0) for facts, Wikipedia (CC BY-SA, attributed) for the description.
// A Wikidata item is accepted only when its identity is verified: ISIN or ticker match, or country + company type + name.
// Only empty fields are filled (an administrator's edits are never overwritten). Processes `limit` stale assets per call.
import { admin, handler, json, requireService } from '../_shared/runtime.ts';

const UA = 'ChartBoursafrikIA/1.0 (https://chart-boursafrikia.com) company-profile-enrichment';
const get = async (url: string) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 60)}`);
  return r.json();
};
const COUNTRY_Q: Record<string, string> = { CI: 'Q1008', SN: 'Q1041', BF: 'Q965', BJ: 'Q962', ML: 'Q912', NE: 'Q1032', TG: 'Q945', GW: 'Q1007', NG: 'Q1033', CM: 'Q1009', GA: 'Q1000', CG: 'Q971', TD: 'Q657', GQ: 'Q983', CF: 'Q929',
  ZA: 'Q258', EG: 'Q79', MA: 'Q1028', KE: 'Q114', GH: 'Q117', TZ: 'Q924', UG: 'Q1036', RW: 'Q1037' };
// Company types (instance of). Newspapers, buildings, people… are not accepted.
const BUSINESS_Q = new Set(['Q4830453', 'Q783794', 'Q891723', 'Q6881511', 'Q22687', 'Q848507', 'Q1145276', 'Q778575', 'Q219577', 'Q2085381', 'Q167037', 'Q658255', 'Q1058914', 'Q1589009', 'Q1331793', 'Q18388277', 'Q740752', 'Q1762059', 'Q15265344', 'Q2421158', 'Q1076968', 'Q4387609', 'Q207652', 'Q1196138', 'Q11691', 'Q936518', 'Q18043413']);
// Sector consistency, required when the name has a single distinctive word (Champion, Standard, Universal…).
const SECTOR_KW: Record<string, RegExp> = {
  banks: /bank|banque|financ|microfinance|mortgage|savings|holding|lending/i, insurance: /insur|assur|reinsur|réassur/i,
  telecom: /telecom|télécom|mobile|operator|opérateur|internet|technolog|software|digital|informati/i,
  consumer: /food|aliment|brew|brass|beverage|boisson|drink|sugar|sucr|flour|farine|dairy|consum|tobacco|tabac|soap|savon|cosmetic|palm|oil|huile/i,
  distribution: /retail|distribu|motor|automobile|vehicle|trading|négoce|auto|hotel/i, industry: /cement|ciment|industr|manufactur|construction|engineering|packaging|emballage|chemical|chimi|cable|câble|steel|paint|plastic/i,
  agri: /agri|palm|rubber|caoutchouc|plantation|farm|livestock|feed|sugar|sucr/i, energy: /energ|électric|electric|power|water|eau|utilit/i,
  oil_gas: /oil|petrol|pétrol|gas|gaz|energ/i, materials: /mining|mine|minier|cement|ciment|resource|ressource/i, conglomerates: /conglomer|group|groupe|holding|diversif/i,
  real_estate: /real estate|immobili|property|construction|reit/i, healthcare: /health|santé|pharma|hospital|hôpital|medic/i,
  services: /service|hotel|hôtel|transport|logisti|media|média|airline|maritime|leasing|publish|édition|education|broadcast/i, investment: /invest|capital|fund|fonds|holding/i,
};
// Same company listed on two exchanges: reuse the verified item.
const FORCE_QID: Record<string, string> = { 'NGX:ETI': 'Q930225' };
// Items reviewed and rejected (homonyms).
const REJECT_QID: Record<string, string[]> = { 'NGX:CHIPLC': ['Q110972571'], 'NGX:CONHALLPLC': ['Q110972571'] };
// Full names for BRVM shares whose listing name is truncated or abbreviated.
const FULL: Record<string, string> = {
  ECOC: "Ecobank Côte d'Ivoire", ETIT: 'Ecobank Transnational', NSBC: "NSIA Banque Côte d'Ivoire", SGBC: "Société Générale Côte d'Ivoire", SIBC: 'Société ivoirienne de banque',
  ORAC: "Orange Côte d'Ivoire", SNTS: 'Sonatel', LNBB: 'Loterie nationale du Bénin', SDSC: 'Africa Global Logistics', SEMC: 'Eviosys', SIVC: "Air Liquide Côte d'Ivoire",
  TTLC: "TotalEnergies Marketing Côte d'Ivoire", TTLS: 'TotalEnergies Marketing Sénégal', SHEC: "Vivo Energy Côte d'Ivoire", CIEC: "Compagnie ivoirienne d'électricité", SDCC: 'SODECI',
  BOAB: 'Bank of Africa Bénin', BOABF: 'Bank of Africa Burkina Faso', BOAC: "Bank of Africa Côte d'Ivoire", BOAM: 'Bank of Africa Mali', BOAN: 'Bank of Africa Niger', BOAS: 'Bank of Africa Sénégal',
  CBIBF: 'Coris Bank International', ONTBF: 'Onatel', ORGT: 'Oragroup', BICC: "BICI Côte d'Ivoire", BICB: 'Banque internationale pour l’industrie et le commerce du Bénin', NTLC: "Nestlé Côte d'Ivoire",
  UNLC: "Unilever Côte d'Ivoire", SLBC: 'Solibra', SPHC: 'SAPH', SOGC: 'SOGB', PALC: 'Palmci', SCRC: 'Sucrivoire', SICC: 'Sicor', CFAC: "CFAO Motors Côte d'Ivoire", PRSC: "Tractafric Motors Côte d'Ivoire",
  BBGC: "Bridge Bank Group Côte d'Ivoire", FTSC: 'Filtisac', CABC: 'Sicable', NEIC: 'NEI-CEDA', ABJC: 'Servair Abidjan', BNBC: "Bernabé Côte d'Ivoire", SMBC: 'Société multinationale de bitumes',
  STAC: 'SETAO', STBC: 'SITAB', UNXC: 'Uniwax', SAFC: "Alios Finance Côte d'Ivoire",
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[’']/g, ' ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\b(PLC|SA|LTD|LIMITED|NIGERIA|CI|THE|DE|DU|LA|LE|D)\b/g, ' ').replace(/\s+/g, ' ').trim();
// Generic words (banks, groups…) don't identify a company: only distinctive words are compared.
const GENERIC = new Set(['IVOIRIENNE', 'IVOIRIEN', 'SENEGALAISE', 'BENINOISE', 'BURKINABE', 'MALIENNE', 'NIGERIENNE', 'TOGOLAISE', 'CAMEROUNAISE', 'GABONAISE', 'NIGERIAN', 'DAILY', 'PLC', 'NIG', 'BANQUE', 'BANK', 'BANCO', 'INTERNATIONALE', 'INTERNATIONAL', 'AFRIQUE', 'AFRICA', 'AFRICAINE', 'OCCIDENTALE', 'CENTRALE', 'WEST', 'SOCIETE', 'COMPAGNIE', 'COMPANY', 'GROUPE', 'GROUP', 'HOLDING', 'HOLDINGS', 'INDUSTRIE', 'INDUSTRIES', 'COMMERCE', 'CREDIT', 'FINANCE', 'FINANCIAL', 'INSURANCE', 'ASSURANCE', 'ASSURANCES', 'NATIONALE', 'NATIONAL', 'POUR', 'ET', 'AND', 'OF', 'COTE', 'IVOIRE', 'SENEGAL', 'BENIN', 'BURKINA', 'FASO', 'MALI', 'NIGER', 'TOGO', 'CAMEROUN', 'GABON', 'CORPORATION', 'TRUST', 'CAPITAL', 'INVESTMENT', 'MOTORS', 'ENERGY', 'ENERGIE', 'OIL', 'GAS', 'CEMENT']);
const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w)));
const sim = (a: string, b: string) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let c = 0; for (const w of A) if (B.has(w)) c++; return (c / A.size + c / B.size) / 2; };
/** Name check: every distinctive word of our name (2/3 of them for long names) found in the label, and at least half of the label's words. */
const nameOk = (ours: string, label: string) => { const A = words(ours), B = words(label); if (!A.size || !B.size) return false; let c = 0; for (const w of A) if (B.has(w)) c++; return c / A.size >= (A.size <= 2 ? 1 : 0.67) && c / B.size >= 0.5; };
const ids = (claims: any, p: string): string[] => (claims?.[p] ?? []).map((c: any) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const str = (claims: any, p: string): string | null => claims?.[p]?.[0]?.mainsnak?.datavalue?.value ?? null;

Deno.serve(handler(async (req) => {
  requireService(req);
  const db = admin();
  const { limit = 15, assetIds } = (await req.json().catch(() => ({}))) as { limit?: number; assetIds?: string[] };
  let q = db.from('assets').select('id, ticker, name, market, country, isin, website, headquarters, founded_year, employees, description_fr, description_en, activity_fr, activity_en, sectors(code)')
    .eq('is_active', true).eq('asset_class', 'equity');
  q = assetIds?.length ? q.in('id', assetIds) : q.or(`profile_updated_at.is.null,profile_updated_at.lt.${new Date(Date.now() - 30 * 86400_000).toISOString()}`);
  const { data: assets } = await q.order('market').limit(Math.min(40, limit));
  const { data: run } = await db.from('ingestion_runs').insert({ job: 'enrich_companies' }).select('id').single();
  const log: { asset: string; result: string; qid?: string; score?: number }[] = [];

  for (const a of assets ?? []) {
    try {
      const searchName = FULL[a.market === 'BRVM' ? a.ticker : ''] ?? a.name;
      const found = new Map<string, true>();
      if (FORCE_QID[a.id]) found.set(FORCE_QID[a.id]!, true);
      for (const lang of FORCE_QID[a.id] ? [] : ['fr', 'en']) {
        const r = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchName)}&language=${lang}&uselang=${lang}&type=item&limit=6&format=json`);
        for (const s of r.search ?? []) found.set(s.id, true);
      }
      // Second strategy: full-text search restricted to the company's country (CirrusSearch haswbstatement), with simplified names.
      const cq = a.country ? COUNTRY_Q[a.country] : null;
      if (cq && !FORCE_QID[a.id]) {
        const words = norm(searchName).replace(/\b(COTE IVOIRE|SENEGAL|BENIN|BURKINA FASO|MALI|NIGER|TOGO|CAMEROUN|GABON)\b/g, ' ').split(' ').filter((w) => w.length > 1);
        const variants = [...new Set([searchName, words.join(' '), words.slice(0, 2).join(' ')])].filter((v) => v.length >= 3);
        for (const v of variants) {
          const r = await get(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${v} haswbstatement:P17=${cq}`)}&srlimit=6&format=json`).catch(() => null);
          for (const h of r?.query?.search ?? []) found.set(h.title, true);
          if (found.size >= 8) break;
        }
      }
      if (!found.size) { log.push({ asset: a.id, result: 'no_candidate' }); await db.from('assets').update({ profile_updated_at: new Date().toISOString(), profile_source: 'not_found' }).eq('id', a.id); continue; }
      const ent = (await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${[...found.keys()].join('|')}&props=claims|sitelinks|labels|descriptions&languages=fr|en&format=json`)).entities ?? {};
      let best: { id: string; e: any; score: number } | null = null;
      for (const [id, e] of Object.entries<any>(ent)) {
        const c = e.claims ?? {};
        const labels = [e.labels?.fr?.value, e.labels?.en?.value].filter(Boolean) as string[];
        const nameSim = Math.max(0, ...labels.map((l) => sim(searchName, l)));
        const isinOk = a.isin && (c.P946 ?? []).some((x: any) => x.mainsnak?.datavalue?.value === a.isin);
        const tickerOk = (c.P414 ?? []).some((x: any) => (x.qualifiers?.P249 ?? []).some((qq: any) => String(qq.datavalue?.value ?? '').toUpperCase() === a.ticker)) || (c.P249 ?? []).some((x: any) => String(x.mainsnak?.datavalue?.value ?? '').toUpperCase() === a.ticker);
        const countryOk = a.country && ids(c, 'P17').includes(COUNTRY_Q[a.country] ?? '-');
        const business = ids(c, 'P31').some((x) => BUSINESS_Q.has(x));
        const named = labels.some((l) => nameOk(searchName, l));
        const sector = (a.sectors as unknown as { code: string } | null)?.code;
        const descTxt = `${labels.join(' ')} ${e.descriptions?.fr?.value ?? ''} ${e.descriptions?.en?.value ?? ''}`;
        const sectorOk = words(searchName).size > 1 || !sector || !SECTOR_KW[sector] || SECTOR_KW[sector]!.test(descTxt);
        let score = 0;
        if (isinOk) score += 100;
        if (tickerOk) score += 80;
        if (countryOk) score += 30;
        if (business) score += 20;
        score += Math.round(nameSim * 40);
        const dissolved = !!c.P576; // dissolved / abolished: a former company, not the listed one
        const forced = FORCE_QID[a.id] === id;
        const rejected = (REJECT_QID[a.id] ?? []).includes(id);
        const verified = !dissolved && !rejected && (forced || isinOk || tickerOk || (countryOk && business && named && sectorOk));
        if (verified && (!best || score > best.score)) best = { id, e, score };
      }
      if (!best) { log.push({ asset: a.id, result: 'not_verified' }); await db.from('assets').update({ profile_updated_at: new Date().toISOString(), profile_source: 'not_found' }).eq('id', a.id); continue; }

      const c = best.e.claims ?? {};
      const refIds = [...ids(c, 'P159'), ...ids(c, 'P169'), ...ids(c, 'P488')].slice(0, 20);
      const refLabels: Record<string, string> = {};
      if (refIds.length) {
        const rl = (await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${refIds.join('|')}&props=labels&languages=fr|en&format=json`)).entities ?? {};
        for (const [k, v] of Object.entries<any>(rl)) refLabels[k] = v.labels?.fr?.value ?? v.labels?.en?.value ?? k;
      }
      const inception = str(c, 'P571') as any;
      const founded = inception?.time ? Number(String(inception.time).slice(1, 5)) : null;
      const empl = (c.P1128 ?? []).map((x: any) => ({ n: Number(x.mainsnak?.datavalue?.value?.amount), t: x.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? '' })).filter((x: any) => x.n > 0).sort((x: any, y: any) => String(y.t).localeCompare(String(x.t)))[0]?.n ?? null;
      const site = str(c, 'P856');
      const hq = ids(c, 'P159')[0];
      // Wikipedia summaries (attributed). French first, English second.
      const wiki: { fr?: { text: string; url: string }; en?: { text: string; url: string } } = {};
      for (const lang of ['fr', 'en'] as const) {
        const title = best.e.sitelinks?.[`${lang}wiki`]?.title;
        if (!title) continue;
        const s = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`).catch(() => null);
        const mentions = s?.extract && [...words(searchName)].some((w) => norm(String(s.extract)).includes(w));
        if (s?.extract && mentions) wiki[lang] = { text: String(s.extract).slice(0, 1500), url: s.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
      }
      const patch: Record<string, unknown> = { wikidata_id: best.id, profile_updated_at: new Date().toISOString(),
        profile_source: wiki.fr || wiki.en ? 'Wikipédia (CC BY-SA 4.0) & Wikidata (CC0)' : 'Wikidata (CC0)',
        profile_source_url: wiki.fr?.url ?? wiki.en?.url ?? `https://www.wikidata.org/wiki/${best.id}` };
      if (!a.website && site) patch.website = site;
      if (!a.founded_year && founded && founded > 1800 && founded <= new Date().getUTCFullYear()) patch.founded_year = founded;
      if (!a.employees && empl) patch.employees = Math.round(empl);
      if (!a.headquarters && hq && refLabels[hq]) patch.headquarters = refLabels[hq];
      if (!a.description_fr && wiki.fr) patch.description_fr = wiki.fr.text;
      if (!a.description_en && wiki.en) patch.description_en = wiki.en.text;
      // Short activity line: kept only when consistent with the stock's sector (avoids "building in Nigeria"-type labels).
      const sc = (a.sectors as unknown as { code: string } | null)?.code;
      const fits = (t?: string) => !!t && (!sc || !SECTOR_KW[sc] || SECTOR_KW[sc]!.test(t)) && !/\b(building|bâtiment|newspaper|journal)\b/i.test(t);
      if (!a.activity_fr && fits(best.e.descriptions?.fr?.value)) patch.activity_fr = best.e.descriptions.fr.value;
      if (!a.activity_en && fits(best.e.descriptions?.en?.value)) patch.activity_en = best.e.descriptions.en.value;
      await db.from('assets').update(patch).eq('id', a.id);
      const execs = [...ids(c, 'P169').map((p) => ({ person: refLabels[p] ?? p, role: 'Directeur général' })), ...ids(c, 'P488').map((p) => ({ person: refLabels[p] ?? p, role: 'Président du conseil d’administration' }))].filter((x) => !/^Q\d+$/.test(x.person)).slice(0, 4);
      if (execs.length) {
        await db.from('asset_executives').delete().eq('asset_id', a.id).eq('source', 'Wikidata');
        await db.from('asset_executives').insert(execs.map((x) => ({ asset_id: a.id, ...x, source: 'Wikidata' })));
      }
      log.push({ asset: a.id, result: wiki.fr || wiki.en ? 'enriched' : 'facts_only', qid: best.id, score: best.score });
    } catch (e) { log.push({ asset: a.id, result: `error: ${String((e as Error).message ?? e).slice(0, 80)}` }); }
  }
  const ok = log.filter((l) => l.result === 'enriched' || l.result === 'facts_only').length;
  await db.from('ingestion_runs').update({ status: log.some((l) => l.result.startsWith('error')) ? 'partial' : 'ok', rows_written: ok, attempts: log, finished_at: new Date().toISOString(), source_used: 'wikidata+wikipedia' }).eq('id', run!.id);
  return json({ processed: log.length, enriched: ok, log });
}));
