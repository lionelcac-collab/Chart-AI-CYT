import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ENTITLEMENTS } from '@chart-boursafrikia/core';
import { Button, Card, Loading, Screen, Txt } from '../../components/ui';
import { useT } from '../../i18n';
import { ApiError, api } from '../../lib/api';
import { fmtPct, fmtPrice } from '../../lib/format';
import { DEMO_MODE, supabase } from '../../lib/supabase';
import { useSettings } from '../../settings';
import { changeColor, radius, space, useTheme } from '../../theme';

type Candidate = { assetId: string; ticker: string; name: string; market: string; confidence: number; read: string };
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

export default function Watchlist() {
  const th = useTheme();
  const { t, lang } = useT();
  const fr = lang === 'fr';
  const { plan } = useSettings();
  const qc = useQueryClient();
  const ids = useQuery({ queryKey: ['watchlist'], queryFn: api.watchlist });
  const all = useQuery({ queryKey: ['search', '', undefined], queryFn: () => api.search(''), enabled: !!ids.data?.length });
  const user = useQuery({ queryKey: ['user'], queryFn: async () => (supabase ? (await supabase.auth.getUser()).data.user : null) });
  const rows = (all.data ?? []).filter((a) => ids.data?.includes(a.id));

  const [reading, setReading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [found, setFound] = useState<{ matched: Candidate[]; unmatched: string[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const max = plan === 'premium' ? ENTITLEMENTS.premium.watchlistItems : ENTITLEMENTS.free.watchlistItems;
  const current = ids.data?.length ?? 0;

  async function importFromImages() {
    setMsg(null);
    if (user.isFetched && !user.data) { router.push('/auth'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.6, allowsMultipleSelection: true, selectionLimit: 4 });
    if (res.canceled || !res.assets.length) return;
    const images: { base64: string; mediaType: string }[] = [];
    for (const a of res.assets.slice(0, 4)) {
      let b64 = a.base64 ?? null;
      let mt = a.mimeType ?? null;
      if ((!b64 || !mt) && a.uri.startsWith('data:')) { const m = /^data:([^;]+);base64,(.*)$/.exec(a.uri); if (m) { mt = mt ?? m[1]!; b64 = b64 ?? m[2]!; } }
      if (!b64) continue;
      mt = mt === 'image/jpg' ? 'image/jpeg' : mt ?? 'image/jpeg';
      if (!ALLOWED.includes(mt)) { setMsg(fr ? 'Format d’image non pris en charge : utilisez une capture PNG ou JPEG.' : 'Unsupported image format: use a PNG or JPEG screenshot.'); return; }
      images.push({ base64: b64, mediaType: mt });
    }
    if (!images.length) return;
    setReading(true); setFound(null);
    try {
      const r = await api.importWatchlistFromImages(images, lang);
      const already = new Set(ids.data ?? []);
      setFound({ matched: r.matched, unmatched: r.unmatched });
      setPicked(new Set(r.matched.filter((c) => !already.has(c.assetId) && c.confidence >= 0.6).map((c) => c.assetId)));
      if (!r.matched.length) setMsg(r.readable
        ? (fr ? 'Aucun titre de la BRVM, de la BVMAC ou de la NGX n’a été reconnu sur ces images.' : 'No BRVM, BVMAC or NGX stock was recognised on these images.')
        : (fr ? 'Aucune liste de titres lisible sur ces images. Essayez une capture plus nette.' : 'No readable list of stocks on these images. Try a sharper screenshot.'));
    } catch (e) {
      const code = (e as ApiError).code;
      setMsg(code === 'AUTH_REQUIRED' ? (fr ? 'Connectez-vous pour importer une capture.' : 'Sign in to import a screenshot.')
        : code === 'QUOTA_EXCEEDED' ? (fr ? `Limite de ${ENTITLEMENTS.free.aiAnalysesPerDay} lectures IA par jour atteinte. Passez à Premium pour continuer.` : `Daily limit of ${ENTITLEMENTS.free.aiAnalysesPerDay} AI readings reached.`)
        : code === 'IMAGE_TOO_LARGE' ? (fr ? 'Image trop lourde (5 Mo maximum).' : 'Image too large (5 MB max).')
        : t.common.error);
    } finally { setReading(false); }
  }

  async function addPicked() {
    const list = [...picked];
    const room = Math.max(0, max - current);
    const toAdd = list.slice(0, room);
    setAdding(true);
    try {
      for (const id of toAdd) await api.toggleWatch(id, true);
      await qc.invalidateQueries({ queryKey: ['watchlist'] });
      setFound(null); setPicked(new Set());
      setMsg(toAdd.length < list.length
        ? (fr ? `${toAdd.length} titre(s) ajouté(s). Limite de ${max} titres atteinte${plan === 'free' ? ' (offre gratuite)' : ''}.` : `${toAdd.length} stock(s) added. ${max}-stock limit reached.`)
        : (fr ? `✓ ${toAdd.length} titre(s) ajouté(s) à votre liste.` : `✓ ${toAdd.length} stock(s) added to your list.`));
    } catch { setMsg(t.common.error); } finally { setAdding(false); }
  }

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Screen refreshing={ids.isRefetching} onRefresh={() => ids.refetch()}>
      <Txt size="xl" weight="800">{t.watchlist.title}</Txt>
      {plan === 'free' ? <Txt size="xs" muted>{t.watchlist.limit}</Txt> : null}
      {DEMO_MODE ? <Txt size="sm" muted>{fr ? 'Les listes de suivi sont enregistrées dans votre compte (backend requis).' : 'Watchlists are saved to your account (backend required).'}</Txt> : null}

      <Card style={{ borderColor: th.accent, borderWidth: 1 }}>
        <Txt weight="800">📷 {fr ? 'Créer ma liste depuis une capture d’écran' : 'Build my list from a screenshot'}</Txt>
        <Txt size="sm" muted>{fr
          ? 'Capture de votre application de courtier, d’un portefeuille, d’un journal ou d’une liste : l’IA reconnaît les titres de la BRVM, de la BVMAC et de la NGX. Jusqu’à 4 images.'
          : 'Screenshot of your broker app, a portfolio, a newspaper or a list: the AI recognises BRVM, BVMAC and NGX stocks. Up to 4 images.'}</Txt>
        <Button label={fr ? 'Choisir des images' : 'Choose images'} icon="✦" loading={reading} onPress={importFromImages} />
        {reading ? <Txt size="sm" muted>✦ {fr ? 'L’IA lit vos images… (5 à 20 secondes)' : 'The AI is reading your images… (5 to 20 seconds)'}</Txt> : null}
        {msg ? <Txt size="sm" color={msg.startsWith('✓') ? th.up : th.warn}>{msg}</Txt> : null}
      </Card>

      {found && found.matched.length ? (
        <Card title={fr ? `Titres reconnus (${found.matched.length})` : `Recognised stocks (${found.matched.length})`}>
          <Txt size="xs" muted>{fr ? 'Vérifiez la sélection puis ajoutez. Touchez une ligne pour la cocher ou la décocher.' : 'Check the selection, then add. Tap a row to toggle it.'}</Txt>
          {found.matched.map((c) => {
            const already = ids.data?.includes(c.assetId);
            const on = picked.has(c.assetId);
            return (
              <Pressable key={c.assetId} disabled={already} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: already }} onPress={() => toggle(c.assetId)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: th.grid, opacity: already ? 0.55 : 1 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: th.accent, backgroundColor: on ? th.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Txt size="xs" weight="900" color={th.accentText}>✓</Txt> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Txt weight="700">{c.ticker} <Txt size="xs" muted>{c.market}</Txt></Txt>
                  <Txt size="xs" muted numberOfLines={1}>{c.name}{c.read && !c.read.toUpperCase().includes(c.ticker) ? ` — ${fr ? 'lu' : 'read'} : « ${c.read} »` : ''}</Txt>
                </View>
                <Txt size="xs" color={already ? th.textMuted : c.confidence < 0.8 ? th.warn : th.textMuted}>{already ? (fr ? 'déjà suivi' : 'already in list') : c.confidence < 0.8 ? (fr ? 'à vérifier' : 'check') : ''}</Txt>
              </Pressable>
            );
          })}
          {found.unmatched.length ? (
            <Txt size="xs" muted>{fr ? 'Non reconnus ou hors BRVM / BVMAC / NGX' : 'Not recognised or outside BRVM / BVMAC / NGX'} : {found.unmatched.join(', ')}</Txt>
          ) : null}
          {current + picked.size > max ? <Txt size="xs" color={th.warn}>{fr ? `Votre liste est limitée à ${max} titres${plan === 'free' ? ' (offre gratuite)' : ''} : seuls les ${Math.max(0, max - current)} premiers seront ajoutés.` : `Your list is limited to ${max} stocks.`}</Txt> : null}
          <Button label={fr ? `Ajouter ${picked.size} titre(s) à ma liste` : `Add ${picked.size} stock(s) to my list`} disabled={!picked.size} loading={adding} onPress={addPicked} />
          <Button label={fr ? 'Annuler' : 'Cancel'} variant="ghost" onPress={() => { setFound(null); setPicked(new Set()); }} />
        </Card>
      ) : null}

      {ids.isLoading ? <Loading /> : !ids.data?.length ? <Card><Txt muted>{fr ? 'Votre liste est vide. Ajoutez des titres depuis leur fiche (☆) ou importez une capture d’écran ci-dessus.' : t.watchlist.empty}</Txt></Card> : (
        <Card title={fr ? `Mes titres (${rows.length})` : `My stocks (${rows.length})`}>
          {rows.map((a) => (
            <Pressable key={a.id} onPress={() => router.push(`/asset/${encodeURIComponent(a.id)}`)} style={{ flexDirection: 'row', paddingVertical: space.sm, borderRadius: radius.sm }}>
              <View style={{ flex: 1 }}><Txt weight="700">{a.ticker} <Txt size="xs" muted>{a.market}</Txt></Txt><Txt size="xs" muted numberOfLines={1}>{a.name}</Txt></View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt size="sm">{fmtPrice(a.last, a.currency, lang)}</Txt>
                <Txt size="sm" weight="700" color={changeColor(th, a.changePct)}>{fmtPct(a.changePct, lang)}</Txt>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
