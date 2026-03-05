import { Linking, Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesPackage,
} from 'react-native-purchases';
import { logger } from '../utils/logger';
import { getCurrentUser } from './firebaseAuthService';
import {
  clearProEntitlement,
  getSubscriptionState,
  saveSubscriptionState,
  setProEntitlement,
} from './subscriptionService';

const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID || 'pro';
const IOS_API_KEY =
  process.env.EXPO_PUBLIC_RC_APPLE_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
  '';
const ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_RC_GOOGLE_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
  '';
const PRO_MONTHLY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_RC_MONTHLY_PRODUCT_ID || 'golfsum_pro_monthly';
const PRO_YEARLY_PRODUCT_ID =
  process.env.EXPO_PUBLIC_RC_YEARLY_PRODUCT_ID || 'golfsum_pro_yearly';
const PRO_PRODUCT_IDS = new Set<string>([
  PRO_MONTHLY_PRODUCT_ID,
  PRO_YEARLY_PRODUCT_ID,
].filter(Boolean));

let configured = false;
let configuredUserId: string | null = null;
let logHandlerConfigured = false;

function maskApiKey(value: string): string {
  if (!value) return '(empty)';
  if (value.length <= 8) return `${value}...`;
  return `${value.slice(0, 8)}...`;
}

async function logRevenueCatDebug(tag: string): Promise<void> {
  if (!__DEV__) return;
  try {
    const appUserID = await Purchases.getAppUserID();
    const info = await Purchases.getCustomerInfo();
    logger.debug(`[RC ${tag}] appUserID: ${appUserID}`);
    logger.debug(`[RC ${tag}] active entitlements: ${JSON.stringify(info.entitlements.active || {})}`);
  } catch (error) {
    logger.debug(`[RC ${tag}] debug fetch failed: ${String((error as any)?.message || error)}`);
  }
}

export interface BillingOfferings {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

export interface BillingSubscriptionStatus {
  isPro: boolean;
  expirationDate: string | null;
  productId: string | null;
  willRenew: boolean;
}

export interface BillingAvailability {
  ready: boolean;
  reason: string | null;
}

function getRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') return IOS_API_KEY;
  if (Platform.OS === 'android') return ANDROID_API_KEY;
  return '';
}

export function getBillingAvailability(): BillingAvailability {
  if (Platform.OS === 'web') {
    return { ready: false, reason: 'Billing is unavailable on web builds.' };
  }
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    return {
      ready: false,
      reason:
        Platform.OS === 'ios'
          ? 'RevenueCat iOS API key is missing. Set EXPO_PUBLIC_RC_APPLE_API_KEY (or EXPO_PUBLIC_REVENUECAT_API_KEY) and rebuild.'
          : 'RevenueCat Android API key is missing. Set EXPO_PUBLIC_RC_GOOGLE_API_KEY (or EXPO_PUBLIC_REVENUECAT_API_KEY) and rebuild.',
    };
  }
  return { ready: true, reason: null };
}

async function ensureConfigured(): Promise<boolean> {
  const availability = getBillingAvailability();
  if (__DEV__) {
    logger.debug(
      `[RC] ensureConfigured called. platform=${Platform.OS}, configured=${configured}, key=${maskApiKey(
        getRevenueCatApiKey()
      )}`
    );
  }
  if (!availability.ready) {
    logger.debug(`${availability.reason ?? 'Billing unavailable'}; skipping billing sync`);
    return false;
  }
  const apiKey = getRevenueCatApiKey();

  const user = getCurrentUser();
  const uid = user?.uid ?? null;

  if (!configured) {
    try {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
      if (__DEV__ && !logHandlerConfigured) {
        Purchases.setLogHandler((level, message) => {
          const isPurchaseCancelled =
            level === LOG_LEVEL.ERROR && /purchase was cancelled/i.test(message);
          if (isPurchaseCancelled) {
            logger.debug(`[RevenueCat] ${message}`);
            return;
          }
          if (level === LOG_LEVEL.ERROR) {
            logger.error(`[RevenueCat] ${message}`);
            return;
          }
          if (level === LOG_LEVEL.WARN) {
            logger.warn(`[RevenueCat] ${message}`);
            return;
          }
          logger.debug(`[RevenueCat] ${message}`);
        });
        logHandlerConfigured = true;
      }
      await Purchases.configure({
        apiKey,
        appUserID: uid || undefined,
      });
      logger.debug(`[RC] configure succeeded. user=${uid ?? 'anonymous'}`);
    } catch (error) {
      logger.warn(`[RC] configure failed: ${String((error as any)?.message || error)}`);
      throw error;
    }
    configured = true;
    configuredUserId = uid;
    await logRevenueCatDebug('configure');
    return true;
  }

  if (uid !== configuredUserId) {
    if (uid) {
      await Purchases.logIn(uid);
      await logRevenueCatDebug('logIn');
    } else {
      await Purchases.logOut();
      await logRevenueCatDebug('logOut');
    }
    configuredUserId = uid;
  }

  return true;
}

function getActiveEntitlement(info: CustomerInfo) {
  return info.entitlements.active[ENTITLEMENT_ID] || null;
}

function hasActiveProSubscription(info: CustomerInfo): boolean {
  const activeSubs = info.activeSubscriptions || [];
  return activeSubs.some((productId) => PRO_PRODUCT_IDS.has(productId));
}

function getFirstMatchingProSubscription(info: CustomerInfo): string | null {
  const activeSubs = info.activeSubscriptions || [];
  return activeSubs.find((productId) => PRO_PRODUCT_IDS.has(productId)) || null;
}

function resolveProAccess(info: CustomerInfo): {
  isPro: boolean;
  expirationDate: string | null;
  productId: string | null;
  willRenew: boolean;
} {
  const entitlement = getActiveEntitlement(info);
  if (entitlement) {
    return {
      isPro: true,
      expirationDate: entitlement.expirationDate ?? info.latestExpirationDate ?? null,
      productId: entitlement.productIdentifier ?? getFirstMatchingProSubscription(info),
      willRenew: entitlement.willRenew ?? true,
    };
  }

  if (hasActiveProSubscription(info)) {
    return {
      isPro: true,
      expirationDate: info.latestExpirationDate ?? null,
      productId: getFirstMatchingProSubscription(info),
      // Fallback assumption when entitlement mapping is delayed/missing.
      willRenew: true,
    };
  }

  return {
    isPro: false,
    expirationDate: null,
    productId: null,
    willRenew: false,
  };
}

function normalizeExpiry(expirationDate: string | null): string {
  if (expirationDate) return expirationDate;
  // Lifetime/non-expiring entitlement fallback.
  return '2099-12-31T23:59:59.000Z';
}

export async function syncSubscriptionEntitlement(): Promise<void> {
  try {
    const ready = await ensureConfigured();
    if (!ready) return;

    const info = await Purchases.getCustomerInfo();
    const resolved = resolveProAccess(info);
    if (resolved.isPro) {
      await setProEntitlement({
        proExpiresAt: normalizeExpiry(resolved.expirationDate),
        purchaseToken: resolved.productId,
      });
      return;
    }

    const current = await getSubscriptionState();
    await saveSubscriptionState({
      tier: 'free',
      proExpiresAt: info.latestExpirationDate || current.proExpiresAt || null,
      proCancelledAt: current.proCancelledAt,
      purchaseToken: current.purchaseToken,
    });
  } catch (error) {
    logger.warn('Billing sync failed (keeping last known subscription state):', error);
  }
}

export async function restorePurchasesAndSync(): Promise<boolean> {
  try {
    const ready = await ensureConfigured();
    if (!ready) return false;
    let info = await Purchases.restorePurchases();
    if (__DEV__) {
      console.log('RESTORE RESULT - all entitlements:', JSON.stringify(info.entitlements));
      console.log('RESTORE RESULT - active:', JSON.stringify(info.entitlements.active));
      console.log('RESTORE RESULT - all subs:', JSON.stringify(info.activeSubscriptions));
    }
    let resolved = resolveProAccess(info);
    if (!resolved.isPro) {
      await Purchases.syncPurchases();
      info = await Purchases.getCustomerInfo();
      resolved = resolveProAccess(info);
      if (__DEV__) {
        console.log('RESTORE RESULT (after sync) - active:', JSON.stringify(info.entitlements.active));
        console.log('RESTORE RESULT (after sync) - all subs:', JSON.stringify(info.activeSubscriptions));
      }
    }
    if (resolved.isPro) {
      await setProEntitlement({
        proExpiresAt: normalizeExpiry(resolved.expirationDate),
        purchaseToken: resolved.productId,
      });
      return true;
    }
    await clearProEntitlement();
    return false;
  } catch (error) {
    logger.warn('Restore purchases failed:', error);
    return false;
  }
}

export async function getOfferings(): Promise<BillingOfferings> {
  const ready = await ensureConfigured();
  if (!ready) {
    throw new Error(getBillingAvailability().reason || 'Billing unavailable');
  }

  const offerings = await Purchases.getOfferings();
  const current =
    offerings.current ||
    Object.values(offerings.all || {})[0] ||
    null;
  if (!current) {
    throw new Error('No RevenueCat offering is configured. Set a current/default offering with monthly and annual packages.');
  }

  const available = current.availablePackages || [];
  const allAvailable = Object.values(offerings.all || {}).flatMap(
    (offering) => offering?.availablePackages || []
  );

  const pickBy = (matcher: (pkg: PurchasesPackage) => boolean): PurchasesPackage | null =>
    available.find(matcher) || null;
  const pickByAnyOffering = (matcher: (pkg: PurchasesPackage) => boolean): PurchasesPackage | null =>
    allAvailable.find(matcher) || null;

  const isMonthlyPackage = (pkg: PurchasesPackage): boolean => {
    const id = pkg.identifier?.toLowerCase?.() || '';
    const product = pkg.product?.identifier?.toLowerCase?.() || '';
    const type = String((pkg as any).packageType || '').toUpperCase();
    return (
      type.includes('MONTH') ||
      id.includes('month') ||
      product.includes('month') ||
      product.includes('monthly')
    );
  };

  const isAnnualPackage = (pkg: PurchasesPackage): boolean => {
    const id = pkg.identifier?.toLowerCase?.() || '';
    const product = pkg.product?.identifier?.toLowerCase?.() || '';
    const type = String((pkg as any).packageType || '').toUpperCase();
    return (
      type.includes('ANNUAL') ||
      type.includes('YEAR') ||
      id.includes('annual') ||
      id.includes('year') ||
      id.includes('yearly') ||
      product.includes('annual') ||
      product.includes('year') ||
      product.includes('yearly') ||
      product.includes('12m')
    );
  };

  const monthly =
    current.monthly ||
    pickBy(isMonthlyPackage) ||
    pickByAnyOffering(isMonthlyPackage);

  const annual =
    current.annual ||
    pickBy(isAnnualPackage) ||
    pickByAnyOffering(isAnnualPackage);

  return {
    monthly: monthly ?? null,
    annual: annual ?? null,
  };
}

export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo?: CustomerInfo }> {
  try {
    const ready = await ensureConfigured();
    if (!ready) return { success: false };

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (__DEV__) {
      console.log('PURCHASE RESULT - all entitlements:', JSON.stringify(customerInfo.entitlements));
      console.log('PURCHASE RESULT - active:', JSON.stringify(customerInfo.entitlements.active));
      console.log('PURCHASE RESULT - all subs:', JSON.stringify(customerInfo.activeSubscriptions));
    }
    let resolvedInfo = customerInfo;
    let resolved = resolveProAccess(resolvedInfo);
    if (!resolved.isPro) {
      await Purchases.syncPurchases();
      resolvedInfo = await Purchases.getCustomerInfo();
      resolved = resolveProAccess(resolvedInfo);
      if (__DEV__) {
        console.log('PURCHASE RESULT (after sync) - active:', JSON.stringify(resolvedInfo.entitlements.active));
        console.log('PURCHASE RESULT (after sync) - all subs:', JSON.stringify(resolvedInfo.activeSubscriptions));
      }
    }
    const isPro = resolved.isPro;
    if (isPro) {
      await setProEntitlement({
        proExpiresAt: normalizeExpiry(resolved.expirationDate),
        purchaseToken: resolved.productId,
      });
    } else {
      const activeEntitlements = Object.keys(resolvedInfo.entitlements.active || {});
      const activeSubscriptions = resolvedInfo.activeSubscriptions || [];
      logger.warn(
        `Purchase completed but expected entitlement "${ENTITLEMENT_ID}" is not active. Active entitlements: ${
          activeEntitlements.join(', ') || 'none'
        }. Active subscriptions: ${activeSubscriptions.join(', ') || 'none'}`
      );
    }
    return { success: isPro, customerInfo: resolvedInfo };
  } catch (error: any) {
    logger.warn(
      `[RC] purchasePackage failed. userCancelled=${Boolean(error?.userCancelled)} code=${String(
        error?.code ?? ''
      )} message=${String(error?.message ?? '')} underlying=${String(
        error?.underlyingErrorMessage ?? ''
      )}`
    );
    if (error?.userCancelled) {
      return { success: false };
    }
    throw error;
  }
}

export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
}> {
  const ready = await ensureConfigured();
  if (!ready) return { success: false };

  let customerInfo = await Purchases.restorePurchases();
  if (__DEV__) {
    console.log('RESTORE RESULT - all entitlements:', JSON.stringify(customerInfo.entitlements));
    console.log('RESTORE RESULT - active:', JSON.stringify(customerInfo.entitlements.active));
    console.log('RESTORE RESULT - all subs:', JSON.stringify(customerInfo.activeSubscriptions));
  }
  let resolved = resolveProAccess(customerInfo);
  if (!resolved.isPro) {
    await Purchases.syncPurchases();
    customerInfo = await Purchases.getCustomerInfo();
    resolved = resolveProAccess(customerInfo);
    if (__DEV__) {
      console.log('RESTORE RESULT (after sync) - active:', JSON.stringify(customerInfo.entitlements.active));
      console.log('RESTORE RESULT (after sync) - all subs:', JSON.stringify(customerInfo.activeSubscriptions));
    }
  }
  const isPro = resolved.isPro;

  if (isPro) {
    await setProEntitlement({
      proExpiresAt: normalizeExpiry(resolved.expirationDate),
      purchaseToken: resolved.productId,
    });
  } else {
    await clearProEntitlement();
  }

  return { success: isPro, customerInfo };
}

export async function getSubscriptionStatus(): Promise<BillingSubscriptionStatus> {
  const ready = await ensureConfigured();
  if (!ready) {
    return {
      isPro: false,
      expirationDate: null,
      productId: null,
      willRenew: false,
    };
  }

  const customerInfo = await Purchases.getCustomerInfo();
  const resolved = resolveProAccess(customerInfo);
  if (!resolved.isPro) {
    return {
      isPro: false,
      expirationDate: null,
      productId: null,
      willRenew: false,
    };
  }

  return {
    isPro: true,
    expirationDate: resolved.expirationDate,
    productId: resolved.productId,
    willRenew: resolved.willRenew,
  };
}

export async function openManageSubscriptions(): Promise<void> {
  const iosDeepLink = 'itms-apps://apps.apple.com/account/subscriptions';
  const webFallback = 'https://apps.apple.com/account/subscriptions';
  const target = Platform.OS === 'ios' ? iosDeepLink : webFallback;

  const canOpenTarget = await Linking.canOpenURL(target);
  if (canOpenTarget) {
    await Linking.openURL(target);
    return;
  }

  const canOpenFallback = await Linking.canOpenURL(webFallback);
  if (canOpenFallback) {
    await Linking.openURL(webFallback);
    return;
  }

  throw new Error('Unable to open subscription management URL.');
}

export async function purchaseProAnnual(): Promise<boolean> {
  try {
    const offerings = await getOfferings();
    const pkg = offerings.annual ?? offerings.monthly;
    if (!pkg) return false;
    const result = await purchasePackage(pkg);
    return result.success;
  } catch (error) {
    logger.warn('Purchase failed/cancelled:', error);
    return false;
  }
}
