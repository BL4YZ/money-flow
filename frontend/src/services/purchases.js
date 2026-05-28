/**
 * RevenueCat wrapper.
 *
 * Works in a dev build / production build where native modules are available.
 * In Expo Go, native modules aren't linked, so we fall back to a mock that
 * lets the rest of the app render without crashing.
 *
 * KEYS — replace these once you have RevenueCat + App Store Connect configured:
 *   RC_API_KEY_IOS  : RevenueCat dashboard → Project → Apps → iOS → Public API key
 *   ENTITLEMENT_ID  : RevenueCat dashboard → Entitlements (e.g. "premium")
 *   OFFERING_ID     : RevenueCat dashboard → Offerings (use "default" to start)
 */

const RC_API_KEY_IOS  = 'REPLACE_WITH_REVENUECAT_IOS_KEY';   // appl_xxxxx
const RC_API_KEY_AND  = 'REPLACE_WITH_REVENUECAT_AND_KEY';   // goog_xxxxx
const ENTITLEMENT_ID  = 'premium';

// ── Load native SDK (not available in Expo Go) ────────────────────────────
let Purchases = null;
let PurchasesError = null;

try {
  const mod = require('react-native-purchases');
  Purchases      = mod.default ?? mod.Purchases ?? mod;
  PurchasesError = mod.PurchasesError;
} catch (_) {
  // Expo Go: native module not linked
  console.warn('[purchases] react-native-purchases not available (Expo Go). Using mock.');
}

const isAvailable = () => Purchases !== null;

// ── Initialize (call once after login) ───────────────────────────────────
export async function initPurchases(userId) {
  if (!isAvailable()) return;
  try {
    const { Platform } = require('react-native');
    const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_AND;
    // Skip if keys are still placeholders (dev without RevenueCat configured)
    if (apiKey.startsWith('REPLACE_WITH')) {
      console.warn('[purchases] RevenueCat API key not configured. Skipping.');
      return;
    }
    await Purchases.configure({ apiKey, appUserID: String(userId) });
    if (__DEV__) Purchases.setLogLevel(Purchases.LOG_LEVEL?.DEBUG ?? 'DEBUG');
  } catch (err) {
    console.warn('[purchases] configure error:', err.message);
  }
}

// ── Get current customer info ─────────────────────────────────────────────
export async function getCustomerInfo() {
  if (!isAvailable()) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.warn('[purchases] getCustomerInfo error:', err.message);
    return null;
  }
}

// ── Check if premium entitlement is active ────────────────────────────────
export function isPremiumActive(customerInfo) {
  if (!customerInfo) return false;
  const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];
  return !!entitlement;
}

// ── Get expiry date of premium entitlement ────────────────────────────────
export function getPremiumExpiry(customerInfo) {
  if (!customerInfo) return null;
  const entitlement = customerInfo.entitlements?.active?.[ENTITLEMENT_ID];
  return entitlement?.expirationDate ?? null; // ISO string or null
}

// ── Fetch available offerings ─────────────────────────────────────────────
export async function getOfferings() {
  if (!isAvailable()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    console.warn('[purchases] getOfferings error:', err.message);
    return null;
  }
}

/**
 * Purchase a package (triggers Apple/Google native payment sheet).
 * @param {object} pkg  - A package from getOfferings()
 * @returns {{ customerInfo, isCancelled }}
 */
export async function purchasePackage(pkg) {
  if (!isAvailable()) {
    // Mock: simulate successful purchase in Expo Go (DEV only)
    console.warn('[purchases] Mock purchase — no native module');
    return { customerInfo: null, isCancelled: false, isMock: true };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { customerInfo, isCancelled: false };
  } catch (err) {
    if (err?.userCancelled) return { customerInfo: null, isCancelled: true };
    throw err;
  }
}

/**
 * Restore previous purchases (required by Apple guidelines).
 * @returns {object} customerInfo
 */
export async function restorePurchases() {
  if (!isAvailable()) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (err) {
    console.warn('[purchases] restore error:', err.message);
    return null;
  }
}

export { ENTITLEMENT_ID };
