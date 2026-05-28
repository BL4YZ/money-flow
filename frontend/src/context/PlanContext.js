import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { getCustomerInfo, isPremiumActive, getPremiumExpiry } from '../services/purchases';

const PlanContext = createContext(null);

/**
 * Feature flags driven by isPremium.
 * All premium features are gated here — add new ones as the product grows.
 */
function buildFlags(isPremium) {
  return {
    isPremium,
    canUpload:        isPremium,
    canUseAI:         isPremium,
    canComparePrices: isPremium,
    canAddGoal:       isPremium, // free = 1 goal max (also enforced in backend)
    canAddBill:       isPremium,
    canShopping:      isPremium,
  };
}

/** Returns days left until expiry, or null if no expiry / already expired */
function daysUntilExpiry(isoDate) {
  if (!isoDate) return null;
  const expires = new Date(isoDate);
  const now = new Date();
  if (expires <= now) return null;
  return Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
}

export function PlanProvider({ children }) {
  const { user } = useAuth();

  // isPremium can come from two sources:
  //   1. user.plan from the backend (DB)  — used on first render
  //   2. RevenueCat CustomerInfo          — authoritative, updated after purchases
  const [rcPremium, setRcPremium]       = useState(null); // null = not yet checked
  const [rcExpiry,  setRcExpiry]        = useState(null);

  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [upgradeContext, setUpgradeContext] = useState(null);

  // Resolve premium status: RevenueCat takes priority once loaded
  const dbPremium = user?.plan === 'premium' &&
    (!user.plan_expires_at || new Date(user.plan_expires_at) > new Date());

  const isPremium = rcPremium !== null ? rcPremium : dbPremium;

  // Trial days: prefer RC expiry, fall back to DB expiry
  const expiryDate = rcExpiry ?? user?.plan_expires_at ?? null;
  const trialDays  = daysUntilExpiry(expiryDate);

  // Check RevenueCat on mount and when user changes
  useEffect(() => {
    if (!user) return;
    checkRC();
  }, [user?.id]);

  const checkRC = async () => {
    try {
      const customerInfo = await getCustomerInfo();
      if (customerInfo) {
        setRcPremium(isPremiumActive(customerInfo));
        setRcExpiry(getPremiumExpiry(customerInfo));
      }
    } catch (_) {}
  };

  /**
   * Called after a successful purchase, restore, or DEV simulation.
   * - Real purchase: pass customerInfo from RevenueCat
   * - DEV simulation / Expo Go mock: pass null → re-fetches plan from DB
   */
  const refreshPlan = useCallback(async (customerInfo) => {
    if (customerInfo) {
      setRcPremium(isPremiumActive(customerInfo));
      setRcExpiry(getPremiumExpiry(customerInfo));
    } else {
      // DEV simulation or no RC: fetch fresh plan from backend DB
      try {
        const api = require('../api/client').default;
        const { data } = await api.get('/auth/me');
        const u = data.user;
        const premiumInDB = u?.plan === 'premium' &&
          (!u.plan_expires_at || new Date(u.plan_expires_at) > new Date());
        setRcPremium(premiumInDB);
        setRcExpiry(u?.plan_expires_at ?? null);
      } catch (_) {
        await checkRC();
      }
    }
  }, []);

  const showUpgrade = useCallback((featureKey = null) => {
    setUpgradeContext(featureKey);
    setUpgradeVisible(true);
  }, []);

  const hideUpgrade = useCallback(() => {
    setUpgradeVisible(false);
    setUpgradeContext(null);
  }, []);

  return (
    <PlanContext.Provider value={{
      ...buildFlags(isPremium),
      plan:     isPremium ? 'premium' : 'free',
      trialDays,
      isTrial:  trialDays !== null,
      refreshPlan,
      upgradeVisible,
      upgradeContext,
      showUpgrade,
      hideUpgrade,
    }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan debe usarse dentro de PlanProvider');
  return ctx;
}
