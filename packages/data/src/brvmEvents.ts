/**
 * Corporate calendar and capital operations read from the BRVM Bulletin Officiel de la Cote (layout text):
 *  - general meetings ("ANNEE : YYYY" table: company, nature, date, time, venue);
 *  - last net dividend paid per share (shares table: amount, payment date, net yield);
 *  - operations in progress (new listings "Première cotation … le <date>");
 *  - AMF-UMOA decisions listed under "AVIS" (approvals, visas).
 * Nothing is inferred: a row that doesn't match the expected layout is skipped.
 */

export interface BrvmMeeting { issuer: string; ticker: string | null; kind: 'agm' | 'egm'; nature: string; date: string; time: string | null; venue: string; cancelled: boolean }
export interface BrvmDividend { ticker: string; amount: number; paymentDate: string; yieldPct: number | null }
export interface BrvmOperation { issuer: string | null; title: string; kind: 'bond_issue' | 'ipo' | 'regulator_visa' | 'rights_issue'; listingDate: string | null; reference: string | null; regulator: string | null }

/** Short names used in the bulletin's tables → BRVM tickers. */
const ISSUER_ALIASES: Record<string, string> = {
  'SERVAIR ABIDJAN CI': 'ABJC', 'BRIDGE BANK GROUP CI': 'BBGC', 'BIIC': 'BICB', 'BIIC BN': 'BICB', 'BICI CI': 'BICC', 'BERNABE CI': 'BNBC',
  'BANK OF AFRICA BN': 'BOAB', 'BANK OF AFRICA BF': 'BOABF', 'BANK OF AFRICA CI': 'BOAC', 'BANK OF AFRICA ML': 'BOAM', 'BANK OF AFRICA NG': 'BOAN',
  'BANK OF AFRICA SN': 'BOAS', 'BANK OF AFRICA SENEGAL': 'BOAS', 'SICABLE CI': 'CABC', 'SICABLE': 'CABC', 'CORIS BANK INTERNATIONAL': 'CBIBF', 'CORIS BANK': 'CBIBF',
  'CFAO MOTORS CI': 'CFAC', 'CIE CI': 'CIEC', 'ECOBANK CI': 'ECOC', 'ECOBANK COTE D IVOIRE': 'ECOC', 'ECOBANK TG': 'ETIT', 'ECOBANK TRANSNATIONAL INCORPORATED': 'ETIT',
  'FILTISAC CI': 'FTSC', 'LNB': 'LNBB', 'LOTERIE NATIONALE DU BENIN': 'LNBB', 'NEI-CEDA CI': 'NEIC', 'NEI CEDA CI': 'NEIC', 'NSBC': 'NSBC', 'NSIA BANQUE CI': 'NSBC',
  'NESTLE CI': 'NTLC', 'ONATEL BF': 'ONTBF', 'ORANGE CI': 'ORAC', 'ORANGE COTE D IVOIRE': 'ORAC', 'ORAGROUP': 'ORGT', 'ORAGROUP TOGO': 'ORGT', 'PALM CI': 'PALC',
  'TRACTAFRIC CI': 'PRSC', 'TRACTAFRIC MOTORS CI': 'PRSC', 'SAFCA CI': 'SAFC', 'SUCRIVOIRE': 'SCRC', 'SODECI': 'SDCC', 'SODE CI': 'SDCC',
  'BOLLORE TRANSPORT & LOGISTICS': 'SDSC', 'BOLLORE TRANSPORT & LOGISTICS CI': 'SDSC', 'AFRICA GLOBAL LOGISTICS': 'SDSC', 'AFRICA GLOBAL LOGISTICS CI': 'SDSC',
  'SIEM': 'SEMC', 'SONOCO METAL PACKAGING SIEM': 'SEMC', 'EVIOSYS PACKAGING SIEM': 'SEMC', 'SGB CI': 'SGBC', 'SOCIETE GENERALE CI': 'SGBC', 'VIVO ENERGY CI': 'SHEC',
  'SIB': 'SIBC', 'SIB CI': 'SIBC', 'SOCIETE IVOIRIENNE DE BANQUE': 'SIBC', 'SICOR': 'SICC', 'SICOR CI': 'SICC', 'ERIUM CI': 'SIVC', 'AIR LIQUIDE CI': 'SIVC',
  'SOLIBRA': 'SLBC', 'SOLIBRA CI': 'SLBC', 'SMB': 'SMBC', 'SMB CI': 'SMBC', 'SONATEL': 'SNTS', 'SONATEL SN': 'SNTS', 'SOGB': 'SOGC', 'SOGB CI': 'SOGC',
  'SAPH': 'SPHC', 'SAPH CI': 'SPHC', 'SETAO CI': 'STAC', 'SITAB': 'STBC', 'SITAB CI': 'STBC', 'TOTAL': 'TTLC', 'TOTALENERGIES MARKETING CI': 'TTLC',
  'TOTAL SENEGAL': 'TTLS', 'TOTALENERGIES MARKETING SN': 'TTLS', 'TOTALENERGIES MARKETING SENEGAL': 'TTLS', 'UNILEVER CI': 'UNLC', 'UNIWAX CI': 'UNXC',
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[’']/g, ' ').replace(/[^A-Z0-9&-]+/g, ' ').replace(/\s+/g, ' ').trim();
export function brvmTickerFor(issuer: string, tickers: Set<string>): string | null {
  const n = norm(issuer);
  if (tickers.has(n)) return n;
  return ISSUER_ALIASES[n] ?? null;
}

const MONTHS: Record<string, string> = { janv: '01', jan: '01', fevr: '02', fev: '02', mars: '03', avr: '04', mai: '05', juin: '06', juil: '07', aout: '08', sept: '09', oct: '10', nov: '11', dec: '12',
  janvier: '01', fevrier: '02', avril: '04', juillet: '07', septembre: '09', octobre: '10', novembre: '11', decembre: '12' };
const month = (s: string) => MONTHS[s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '')] ?? null;
const num = (s: string) => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));

export function parseBrvmMeetings(text: string, tickers: Set<string>): BrvmMeeting[] {
  const out: BrvmMeeting[] = [];
  const lines = text.split('\n');
  const re = /^\s*([A-Z0-9][A-Z0-9 &'’.\-]*?[A-Z0-9.])\s{2,}(Ordinaire|Extraordinaire|Mixte)\s{2,}(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})(?::\d{2})?\s+(.+?)\s*$/;
  let last: BrvmMeeting | null = null;
  for (const l of lines) {
    const m = re.exec(l);
    if (m) {
      const [, issuer, nature, d, mo, y, time, venue] = m;
      last = { issuer: issuer!.trim(), ticker: brvmTickerFor(issuer!, tickers), kind: nature === 'Extraordinaire' ? 'egm' : 'agm', nature: nature!, date: `${y}-${mo}-${d}`, time: time ?? null, venue: venue!, cancelled: /annul/i.test(venue!) };
      out.push(last);
      continue;
    }
    // Venue continued on the next lines (deep indentation, no other column).
    if (last && /^\s{40,}\S/.test(l) && !/^\s+\d+\s*$/.test(l) && !/novembre|décembre|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre/i.test(l.trim().split(' ')[0] ?? '')) {
      last.venue = `${last.venue} ${l.trim()}`.slice(0, 300);
      if (/annul/i.test(l)) last.cancelled = true;
    } else if (!l.trim()) last = null;
  }
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.issuer}|${x.date}|${x.nature}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export function parseBrvmDividends(text: string, tickers: Set<string>): BrvmDividend[] {
  const out: BrvmDividend[] = [];
  const re = /^\s{4,14}([A-Z]{4,5})\s{2,}.*%\s+(\d[\d   ]{0,9}(?:,\d+)?)\s+(\d{1,2})-([A-Za-zéèûôÉ.]+)-(\d{2})\s+(-?\d+(?:,\d+)?)\s*%/;
  for (const l of text.split('\n')) {
    const m = re.exec(l);
    if (!m || !tickers.has(m[1]!)) continue;
    const mo = month(m[4]!);
    if (!mo) continue;
    const amount = num(m[2]!);
    if (!(amount > 0)) continue;
    out.push({ ticker: m[1]!, amount, paymentDate: `20${m[5]}-${mo}-${m[3]!.padStart(2, '0')}`, yieldPct: num(m[6]!) });
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.ticker) ? false : (seen.add(x.ticker), true)));
}

export function parseBrvmOperations(text: string): BrvmOperation[] {
  const out: BrvmOperation[] = [];
  const lines = text.split('\n');
  // "Première cotation - <TITLE> (<SYMBOL>) - Première cotation le 1er décembre 2026", issuer optionally on the left.
  // The issuer column may be unreadable (PDF font encoding): kept only when it looks like a name.
  const re = /^(.*?)Première cotation - (.+?) - Première cotation le (\d{1,2})(?:er)? ([a-zéèûô]+) (\d{4})/i;
  for (const l of lines) {
    const m = re.exec(l);
    if (!m) continue;
    const left = m[1]!.trim();
    m[1] = /^[A-Z][A-Z0-9 &'’.\-]{2,40}$/.test(left) ? left : (undefined as unknown as string);
    const mo = month(m[4]!);
    const title = m[2]!.trim();
    const ref = /\(([A-Z0-9.]+)\)\s*$/.exec(title)?.[1] ?? null;
    out.push({ issuer: m[1]?.trim() ?? null, title, kind: /\.O\d+\)?$/.test(ref ?? '') || /BOND|%/i.test(title) ? 'bond_issue' : 'ipo', listingDate: mo ? `${m[5]}-${mo}-${m[3]!.padStart(2, '0')}` : null, reference: ref, regulator: null });
  }
  // AMF-UMOA decisions in "AVIS": "AMF-UMOA  Décision N°AMF-  Décision AMF-UMOA  <object>" + "UMOA/2026/335" on the next line.
  for (let i = 0; i < lines.length; i++) {
    const m = /^AMF-UMOA\s+Décision N°AMF-\s+Décision AMF-UMOA\s+(.+?)\s*$/.exec(lines[i]!);
    if (!m) continue;
    const next = lines[i + 1] ?? '';
    const visa = /(UMOA\/\d{4}\/\d+)/.exec(next)?.[1] ?? null;
    const cont = next.replace(/^\s*UMOA\/\d{4}\/\d+/, '').trim();
    const object = `${m[1]}${cont && !/^\d+$/.test(cont) ? ` ${cont}` : ''}`.replace(/-\s+/g, '-').trim();
    if (!/agr[ée]ment|visa|autoris/i.test(object) || /non-renouvellement|retrait/i.test(object)) continue;
    out.push({ issuer: null, title: object, kind: 'regulator_visa', listingDate: null, reference: visa ? `AMF-${visa}` : null, regulator: 'AMF-UMOA' });
  }
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.title) ? false : (seen.add(x.title), true)));
}

export interface BrvmCommunique { issuer: string; ticker: string | null; reference: string; nature: string; object: string }

/** "COMMUNIQUES" table (Emetteur / N° / Nature / Objet): official issuer releases listed in the bulletin. */
export function parseBrvmCommuniques(text: string, tickers: Set<string>): BrvmCommunique[] {
  const lines = text.split('\n');
  const out: BrvmCommunique[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*COMMUNIQU[EÉ]S\s*$/.test(lines[i]!)) continue;
    const header = lines.slice(i + 1, i + 4).find((l) => /Emetteur/.test(l) && /Objet/.test(l));
    if (!header) continue;
    const cN = header.indexOf('N°'), cNat = header.indexOf('Nature'), cObj = header.indexOf('Objet');
    if (cN < 0 || cNat < 0 || cObj < 0) continue;
    let cur: BrvmCommunique | null = null, blanks = 0;
    for (let j = lines.indexOf(header, i) + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (!l.trim()) { if (++blanks >= 3) break; continue; }
      blanks = 0;
      if (/^\s*(AVIS|ASSEMBL|OPERATIONS|ANNEE|Emetteur)/.test(l) || /^\s+\d+\s*$/.test(l)) break;
      const col = (a: number, b?: number) => l.slice(a, b).trim();
      const issuer = col(0, cN), ref = col(cN, cNat), nature = col(cNat, cObj), object = col(cObj);
      if (issuer && ref) {
        cur = { issuer, ticker: brvmTickerFor(issuer, tickers), reference: ref, nature, object };
        out.push(cur);
      } else if (cur) {
        if (nature) cur.nature = `${cur.nature} ${nature}`.trim();
        if (object) cur.object = `${cur.object} ${object}`.trim();
      }
    }
  }
  return out;
}
