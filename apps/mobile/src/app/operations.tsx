import { marketLabel } from '@chart-boursafrikia/core';
// IPOs, bond issues and regulator approvals (BRVM official bulletin: operations in progress + AMF-UMOA notices).
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Card, ErrorBox, Loading, Pill, Row, Screen, Txt } from '../components/ui';
import { useT } from '../i18n';
import { api, type CapitalOperation } from '../lib/api';
import { fmtDate, fmtNum } from '../lib/format';
import { radius, space, useTheme } from '../theme';

const KIND: Record<CapitalOperation['kind'], { fr: string; en: string; icon: string }> = {
  ipo: { fr: 'Introduction en bourse', en: 'IPO', icon: '🚀' }, bond_issue: { fr: 'Emprunt obligataire', en: 'Bond issue', icon: '🧾' },
  rights_issue: { fr: 'Augmentation de capital', en: 'Rights issue', icon: '➕' }, delisting: { fr: 'Radiation', en: 'Delisting', icon: '⏏' },
  regulator_visa: { fr: 'Agrément du régulateur', en: 'Regulator approval', icon: '✅' },
};

export default function OperationsScreen() {
  const th = useTheme();
  const { lang } = useT();
  const fr = lang === 'fr';
  const q = useQuery({ queryKey: ['capital-ops'], queryFn: api.capitalOperations });
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');
  const today = new Date().toISOString().slice(0, 10);
  const ops = (q.data ?? []).filter((o) => filter === 'all' || (o.listing_date ? o.listing_date >= today : o.status === 'approved' || o.status === 'announced' || o.status === 'open'));
  const statusOf = (o: CapitalOperation) => o.kind === 'regulator_visa' ? { l: fr ? 'Agréé' : 'Approved', c: th.info }
    : o.listing_date && o.listing_date >= today ? { l: fr ? `Cotation le ${fmtDate(o.listing_date, lang)}` : `Listing ${fmtDate(o.listing_date, lang)}`, c: th.accent }
    : o.listing_date ? { l: fr ? `Coté depuis le ${fmtDate(o.listing_date, lang)}` : `Listed ${fmtDate(o.listing_date, lang)}`, c: th.textMuted } : { l: o.status, c: th.textMuted };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: fr ? 'IPO & emprunts' : 'IPOs & bonds' }} />
      <View>
        <Txt size="xl" weight="800">{fr ? 'IPO & emprunts à venir' : 'Upcoming IPOs & bonds'}</Txt>
        <Txt size="sm" muted>{fr ? 'Introductions en bourse, emprunts obligataires et agréments du régulateur (AMF-UMOA), relevés dans le Bulletin Officiel de la Cote de la BRVM.' : 'IPOs, bond issues and regulator approvals (AMF-UMOA), from the BRVM official bulletin.'}</Txt>
      </View>
      <Row gap={6}>
        <Pill label={fr ? 'À venir & en cours' : 'Upcoming & ongoing'} active={filter === 'upcoming'} onPress={() => setFilter('upcoming')} />
        <Pill label={fr ? 'Tout' : 'All'} active={filter === 'all'} onPress={() => setFilter('all')} />
      </Row>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox message={fr ? 'Données indisponibles.' : 'Data unavailable.'} onRetry={() => q.refetch()} /> : !ops.length ? (
        <Card><Txt muted>{fr ? 'Aucune opération à venir publiée pour le moment.' : 'No upcoming operation published yet.'}</Txt></Card>
      ) : ops.map((o) => {
        const k = KIND[o.kind]; const st = statusOf(o);
        return (
          <Card key={o.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Txt size="xs" muted style={{ flex: 1 }}>{k.icon} {fr ? k.fr : k.en}{o.market ? ` · ${marketLabel(o.market)}` : ''}</Txt>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: st.c }}><Txt size="xs" weight="700" color={st.c}>{st.l}</Txt></View>
            </Row>
            <Txt weight="800">{o.issuer}</Txt>
            <Txt size="sm">{o.title}</Txt>
            <View style={{ gap: 2 }}>
              {o.coupon_pct != null ? <Txt size="xs" muted>{fr ? 'Taux' : 'Coupon'} : {fmtNum(o.coupon_pct, lang, 2)} %</Txt> : null}
              {o.amount != null ? <Txt size="xs" muted>{fr ? 'Montant' : 'Amount'} : {fmtNum(o.amount, lang, 0)} {o.currency === 'XOF' ? 'FCFA' : o.currency ?? ''}</Txt> : null}
              {o.subscription_start ? <Txt size="xs" muted>{fr ? 'Souscription' : 'Subscription'} : {fmtDate(o.subscription_start, lang)}{o.subscription_end ? ` → ${fmtDate(o.subscription_end, lang)}` : ''}</Txt> : null}
              {o.visa_number ? <Txt size="xs" muted>{o.kind === 'regulator_visa' ? (fr ? 'Décision' : 'Decision') : (fr ? 'Symbole' : 'Symbol')} : {o.visa_number}</Txt> : null}
            </View>
            {o.source_url ? <Pressable onPress={() => Linking.openURL(o.source_url!)}><Txt size="xs" color={th.accent}>{fr ? 'Source : Bulletin Officiel de la Cote ↗' : 'Source: official bulletin ↗'}</Txt></Pressable> : null}
          </Card>
        );
      })}
      <Txt size="xs" muted style={{ marginTop: space.sm }}>{fr ? 'Information publiée par la bourse et le régulateur, pas une incitation à souscrire. Couverture actuelle : BRVM (NGX et BVMAC non couverts pour l’instant).' : 'Information published by the exchange and regulator, not an invitation to subscribe. Current coverage: BRVM (NGX and BVMAC not covered yet).'}</Txt>
    </Screen>
  );
}
