import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { PRICING } from '@chart-boursafrikia/core';
import { Button, Card, Pill, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { buy, getPackages, restore, supportsInAppPurchases, webCheckout, type PurchasesPackage } from '../lib/purchases';
import { DEMO_MODE } from '../lib/supabase';
import { useSettings } from '../settings';
import { space, useTheme } from '../theme';

export default function Premium() {
  const th = useTheme();
  const { t, lang } = useT();
  const { setPlan } = useSettings();
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [currency, setCurrency] = useState<keyof typeof PRICING>('XOF');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pkgs = useQuery({ queryKey: ['rc-packages'], queryFn: getPackages, enabled: supportsInAppPurchases });

  const storePkg: PurchasesPackage | undefined = pkgs.data?.find((p) => (period === 'yearly' ? /annual|year/i : /month/i).test(p.identifier));
  const storePrice = (storePkg as { product?: { priceString?: string } } | undefined)?.product?.priceString;
  const p = PRICING[currency];
  const label = (v: number) => `${new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(v)} ${currency === 'XOF' || currency === 'XAF' ? 'FCFA' : currency}`;

  async function subscribe() {
    setBusy(true); setMsg(null);
    try {
      if (DEMO_MODE) { setMsg(lang === 'fr' ? 'Abonnements désactivés en mode démo.' : 'Subscriptions disabled in demo mode.'); return; }
      if (Platform.OS === 'web') { await webCheckout(period, currency); return; }
      if (!storePkg) { setMsg(lang === 'fr' ? 'Offre indisponible pour le moment.' : 'Offer unavailable right now.'); return; }
      if (await buy(storePkg)) { setPlan(await api.plan()); router.back(); }
    } catch (e) {
      setMsg((e as Error).message === 'PAYMENT_INIT_FAILED'
        ? (lang === 'fr' ? 'Le paiement en ligne est momentanément indisponible. Réessayez plus tard ou contactez-nous : hello@otheon-tech.com.' : 'Online payment is temporarily unavailable. Please try again later.')
        : (lang === 'fr' ? 'Achat annulé ou échoué.' : 'Purchase cancelled or failed.'));
    } finally { setBusy(false); }
  }

  return (
    <Screen edges={['bottom']}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Txt size="xxl" weight="800" color={th.accent}>✦ {t.premium.title}</Txt>
        <Txt muted>{t.premium.subtitle}</Txt>
      </View>
      <Card>
        {t.premium.features.map((f) => <Row key={f}><Txt color={th.up}>✓</Txt><Txt size="sm">{f}</Txt></Row>)}
      </Card>
      <Row style={{ justifyContent: 'center' }}>
        <Pill label={t.premium.monthly} active={period === 'monthly'} onPress={() => setPeriod('monthly')} />
        <Pill label={`${t.premium.yearly} · ${t.premium.save}`} active={period === 'yearly'} onPress={() => setPeriod('yearly')} />
      </Row>
      {Platform.OS === 'web' ? (
        <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {(Object.keys(PRICING) as (keyof typeof PRICING)[]).map((c) => <Pill key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} />)}
        </Row>
      ) : null}
      <Card style={{ alignItems: 'center' }}>
        <Txt size="xl" weight="800">{storePrice ?? label(period === 'yearly' ? p.yearly : p.monthly)}</Txt>
        <Txt size="sm" muted>{period === 'yearly' ? (lang === 'fr' ? 'par an' : 'per year') : (lang === 'fr' ? 'par mois' : 'per month')} · {t.premium.trial}</Txt>
      </Card>
      <Button label={Platform.OS === 'web' ? t.premium.web : t.premium.cta} loading={busy} onPress={subscribe} />
      {supportsInAppPurchases ? <Button label={t.premium.restore} variant="ghost" onPress={async () => { if (await restore()) { setPlan('premium'); router.back(); } }} /> : null}
      {msg ? <Txt size="sm" color={th.warn} style={{ textAlign: 'center' }}>{msg}</Txt> : null}
      <Txt size="xs" muted style={{ marginTop: space.md }}>{Platform.OS === 'web' ? (lang === 'fr' ? 'Paiement sécurisé par Mobile Money ou carte bancaire. L’accès Premium est activé dès la confirmation du paiement, pour la durée choisie.' : 'Secure payment by Mobile Money or card. Premium is activated as soon as payment is confirmed, for the chosen period.') : t.premium.legal}</Txt>
      <Row style={{ justifyContent: 'center' }}>
        <Txt size="xs" color={th.info} onPress={() => router.push('/legal/terms')}>{t.more.terms}</Txt>
        <Txt size="xs" muted>·</Txt>
        <Txt size="xs" color={th.info} onPress={() => router.push('/legal/privacy')}>{t.more.privacy}</Txt>
      </Row>
    </Screen>
  );
}
