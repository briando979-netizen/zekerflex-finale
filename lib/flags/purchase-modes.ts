// Feature flag: enable subscription + one-time purchase choice

export async function purchaseModesEnabled(): Promise<boolean> {
  // Controlled via Admin → Systeem → Instellingen → Aankoopmodi
  // TODO: implement flag reading from Admin settings
  return true; // Enable by default for now
}

export const PURCHASE_MODES_FEATURES = {
  showToggle: true, // Show the mode selector in cart
  enableSubscription: true, // Allow recurring charges
  enableOneTime: true, // Allow single purchases
  subscriptionDiscount: 0.15, // 15% discount for monthly vs one-time
};
