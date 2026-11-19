# Publication App Store & Google Play

## 1. Prérequis (dépendent de vous)

- [ ] Compte **Apple Developer** (99 $/an) — idéalement au nom d'une société (numéro D-U-N-S) : une app financière
      publiée par un particulier est plus souvent refusée.
- [ ] Compte **Google Play Console** (25 $) — vérification d'identité de l'organisation.
- [ ] Compte **Expo** (EAS) + `npx eas-cli@latest init` pour obtenir le `projectId` (à mettre dans `app.json > extra.eas.projectId`).
- [ ] **RevenueCat** : projet, apps iOS/Android, produits `nyota_premium_monthly` / `nyota_premium_yearly` avec essai de
      7 jours, droit (« entitlement ») **`premium`**, clés publiques SDK → `.env`, webhook → `revenuecat-webhook`.
- [ ] Produits d'abonnement créés dans App Store Connect et Play Console (même groupe d'abonnement, essai 7 jours).
- [ ] URL publiques : politique de confidentialité, conditions, support (page web ou site vitrine).
- [ ] Icône 1024×1024 et écran de lancement à l'identité Nyota (les fichiers actuels d'`assets/` sont ceux du modèle Expo).

## 2. Build & soumission

```bash
cd apps/mobile
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios --latest
npx eas-cli@latest submit --platform android --latest   # piste « internal » d'abord
```

## 3. Fiche (FR / EN)

- **Nom** : Nyota — Bourses africaines & IA · *Nyota — African Stocks & AI*
- **Sous-titre** : BRVM, BVMAC, NGX : analyses et alertes · *BRVM, BVMAC, NGX: analysis & alerts*
- **Catégorie** : Finance
- **Description courte (Play)** : Cours, plus bas/plus hauts, analyses IA et consensus des bourses africaines.
- **Mots-clés (iOS)** : BRVM,bourse,Abidjan,NGX,Nigeria,BVMAC,actions,dividende,FCFA,analyse,investir,Afrique
- **Description** : présenter les fonctions (tableau de bord multi-marchés, fiches complètes, plus bas/plus hauts sur
  7 périodes, consensus, assistant IA, alertes) **sans promesse de gains**, et inclure la mention : « Nyota est un outil
  d'information. Il ne fournit pas de conseil en investissement et ne passe pas d'ordres. Investir comporte un risque de
  perte en capital. Les cours sont des cours de clôture ou différés. »

## 4. Captures d'écran

Générées depuis la version web en mode démo (bandeau « données fictives » visible — **obligatoire** tant que les données
réelles ne sont pas branchées, sinon utilisez des captures avec les vraies données) :
iPhone 6,9" (1320×2868), iPad 13" si `supportsTablet`, Android téléphone (1080×1920+). Écrans : tableau de bord, fiche
actif (graphique), plus bas/plus hauts, consensus, assistant, Premium.

## 5. Points de conformité store vérifiés dans le code

| Exigence | Où |
|---|---|
| Achats intégrés pour l'abonnement numérique sur iOS/Android | `src/lib/purchases.ts` (RevenueCat) ; aucun lien vers le paiement web dans les apps natives (`webCheckout` lève `WEB_ONLY`) |
| Restauration des achats | bouton « Restaurer mes achats » (`premium.tsx`) |
| Termes de l'abonnement (prix, durée, renouvellement, liens CGU/confidentialité) sur l'écran d'achat | `premium.tsx` |
| Suppression du compte dans l'app | Plus › Compte › Supprimer mon compte → `delete-account` |
| Justification des permissions (photos) | `app.json > ios.infoPlist`, plugin `expo-image-picker` |
| Avertissements financiers, pas de conseil personnalisé | `legal.ts`, `Disclaimer` sur consensus/IA/assistant |
| Google Play — Data safety | Données : e-mail, identifiants d'achat, préférences, jeton push ; chiffrées en transit ; suppression possible ; non vendues |
| Apple — App Privacy | Contact info (e-mail) lié à l'utilisateur ; Purchases ; Identifiers (push) ; pas de tracking |
| Contenu généré par IA | Mention « Analyse générée automatiquement » + sources affichées ; signalement via le support |
| Google Play « Services financiers » | Déclarer : app d'information, pas de trading, pas de crédit ; selon pays, une attestation peut être demandée |

## 6. Réglementation financière (à faire valider par un juriste)

L'app est conçue comme **outil d'information** (pas de recommandation personnalisée, pas d'ordre). Selon votre pays
d'établissement et les pays ciblés (UEMOA : AMF-UMOA ; CEMAC : COSUMAF ; Nigeria : SEC), vérifiez qu'aucun agrément de
conseiller en investissement n'est requis pour publier des « orientations » et des classements statistiques.
