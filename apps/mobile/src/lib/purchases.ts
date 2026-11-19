// Native in-app purchases via RevenueCat (mandatory on App Store / Google Play for digital subscriptions).
// app_user_id = Supabase user id so the RevenueCat webhook can update `profiles`.
import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

export const ENTITLEMENT = 'premium';
let configured = false;

export async function initPurchases(userId?: string) {
  const apiKey = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_RC_IOS_KEY : process.env.EXPO_PUBLIC_RC_ANDROID_KEY;
  if (!apiKey || configured) return false;
  Purchases.configure({ apiKey, appUserID: userId ?? null });
  configured = true;
  return true;
}

export async function identify(userId: string) {
  if (configured) await Purchases.logIn(userId);
}

export async function getPackages(): Promise<PurchasesPackage[]> {
  if (!configured) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return !!customerInfo.entitlements.active[ENTITLEMENT];
}

export async function restore(): Promise<boolean> {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active[ENTITLEMENT];
}

export const supportsInAppPurchases = true;
export type { PurchasesPackage };

/** Store rules forbid steering to external payment inside the iOS/Android apps: web checkout is web-only. */
export async function webCheckout(_plan: 'monthly' | 'yearly', _currency: string): Promise<void> {
  throw new Error('WEB_ONLY');
}
