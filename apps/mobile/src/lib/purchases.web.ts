// Web: no store billing. Checkout via mobile money / card (CinetPay) through the `payment-init` edge function.
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export const ENTITLEMENT = 'premium';
export type PurchasesPackage = { identifier: string };
export async function initPurchases() { return false; }
export async function identify(_userId: string) {}
export async function getPackages(): Promise<PurchasesPackage[]> { return []; }
export async function buy(_pkg: PurchasesPackage) { return false; }
export async function restore() { return false; }
export const supportsInAppPurchases = false;

export async function webCheckout(plan: 'monthly' | 'yearly', currency: string): Promise<void> {
  if (!supabase) throw new Error('NO_BACKEND');
  const { data, error } = await supabase.functions.invoke('payment-init', { body: { plan, currency } });
  if (error || !data?.paymentUrl) throw new Error('PAYMENT_INIT_FAILED');
  await WebBrowser.openBrowserAsync(data.paymentUrl);
}
