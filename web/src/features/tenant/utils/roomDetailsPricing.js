/**
 * Room details pricing & lease term calculations.
 *
 * PRICING tier (which base rate/discount applies) follows the room's
 * configurable long-term discount threshold (`room.longTermLeaseMinMonths`,
 * platform default 6 months when unset), NOT a fixed month count. It is
 * independent of the fixed 1-5 / 6+ month LEGAL contract-template
 * classification enforced server-side (see server/config/contractLegalTerm.js)
 * — a 6-9 month lease can be legally Long-Term while still billed at the
 * short-duration rate until the room's actual threshold is reached.
 */

export function getFlyerRates(roomType, targetRoom = {}) {
  const norm = String(roomType || targetRoom?.type || "").toLowerCase();
  let defaultLong = 6000;
  let defaultShort = 7000;
  let defaultDiscount = targetRoom?.quadrupleDiscountPercent ?? 10;

  if (norm.includes("double")) {
    defaultLong = 9000;
    defaultShort = 10000;
    defaultDiscount = targetRoom?.doubleDiscountPercent ?? 20;
  } else if (norm.includes("private")) {
    defaultLong = 15000;
    defaultShort = 16000;
    defaultDiscount = targetRoom?.privateDiscountPercent ?? 10;
  }

  const regularLong =
    typeof targetRoom?.regularLongRate === "number" && targetRoom.regularLongRate > 0
      ? targetRoom.regularLongRate
      : defaultLong;

  const regularShort =
    typeof targetRoom?.regularShortRate === "number" && targetRoom.regularShortRate > 0
      ? targetRoom.regularShortRate
      : defaultShort;

  const discountPercent =
    typeof targetRoom?.longTermDiscountPercent === "number"
      ? targetRoom.longTermDiscountPercent
      : defaultDiscount;

  const longTerm =
    typeof targetRoom?.monthlyPrice === "number" && targetRoom.monthlyPrice > 0
      ? targetRoom.monthlyPrice
      : Math.round(regularLong * (1 - discountPercent / 100));

  const shortTerm =
    typeof targetRoom?.shortTermRate === "number" && targetRoom.shortTermRate > 0
      ? targetRoom.shortTermRate
      : Math.round(regularShort * (1 - discountPercent / 100));

  return { regularShort, shortTerm, regularLong, longTerm, discountPercent };
}

export function calculateRoomDetailsCost({
  room,
  roomType,
  activeLeaseDuration,
  calculateApplianceFees,
}) {
  const flyer = getFlyerRates(roomType, room);
  const isDiscountEnabled = room?.isDiscountEnabled !== false;

  const pricingThreshold =
    Number.isFinite(Number(room?.longTermLeaseMinMonths)) && Number(room.longTermLeaseMinMonths) > 0
      ? Number(room.longTermLeaseMinMonths)
      : 6;
  const leaseMonths = parseInt(activeLeaseDuration, 10) || 6;
  const isLongTerm = leaseMonths >= pricingThreshold;

  const regularRate = isLongTerm ? flyer.regularLong : flyer.regularShort;
  const monthlyRate = isDiscountEnabled
    ? (isLongTerm ? flyer.longTerm : flyer.shortTerm)
    : regularRate;

  const flyerDiscount =
    isDiscountEnabled && regularRate > monthlyRate
      ? regularRate - monthlyRate
      : 0;

  const effectiveDiscountPercent =
    isDiscountEnabled && regularRate > 0 && flyerDiscount > 0
      ? Math.round((flyerDiscount / regularRate) * 100)
      : 0;

  const applianceFees =
    typeof calculateApplianceFees === "function" ? calculateApplianceFees() : 0;
  const securityDeposit = monthlyRate;
  const upfrontTotal = monthlyRate + securityDeposit;
  const contractTotal = (monthlyRate + applianceFees) * leaseMonths;
  const totalSavings = flyerDiscount * leaseMonths;

  return {
    ...flyer,
    isLongTerm,
    leaseMonths,
    activeRegularRate: regularRate,
    activeMonthlyRate: monthlyRate,
    activeFlyerDiscount: flyerDiscount,
    discountPercent: effectiveDiscountPercent,
    applianceFeesAmount: applianceFees,
    securityDepositAmount: securityDeposit,
    calculatedUpfrontTotal: upfrontTotal,
    calculatedContractTotal: contractTotal,
    totalSavingsAmount: totalSavings,
  };
}

export const APPLIANCE_DEFAULT_PRICE = 200;

export const STANDARD_APPLIANCES_CATALOG = Object.freeze([
  { id: "fan", name: "Electric Fan", unitPrice: APPLIANCE_DEFAULT_PRICE },
  { id: "ricecooker", name: "Rice Cooker", unitPrice: APPLIANCE_DEFAULT_PRICE },
  { id: "laptop", name: "Laptop", unitPrice: APPLIANCE_DEFAULT_PRICE },
]);

/**
 * Normalizes and resolves itemized appliance breakdowns from arrays, objects, or draft records.
 * Calculates unit pricing (default ₱200/mo or room override), item subtotals, and display labels.
 */
export function resolveApplianceBreakdown(
  selectedAppliances = [],
  rawApplianceFees = 0,
  room = {}
) {
  let list = [];
  if (Array.isArray(selectedAppliances)) {
    list = selectedAppliances;
  } else if (selectedAppliances && typeof selectedAppliances === "object") {
    list = Object.entries(selectedAppliances)
      .map(([id, qty]) => ({
        id,
        name:
          id === "laptop"
            ? "Laptop"
            : id === "ricecooker"
            ? "Rice Cooker"
            : id === "fan"
            ? "Electric Fan"
            : id.charAt(0).toUpperCase() + id.slice(1),
        quantity: Number(qty) || 0,
      }))
      .filter((item) => item.quantity > 0);
  }

  const defaultUnitFee =
    Number.isFinite(Number(room?.applianceFeeAmountPerUnit)) &&
    Number(room.applianceFeeAmountPerUnit) > 0
      ? Number(room.applianceFeeAmountPerUnit)
      : APPLIANCE_DEFAULT_PRICE;

  const items = list
    .map((item) => {
      const rawName = item?.name || item?.id || "Appliance";
      // Clean up common name display
      const name =
        rawName.toLowerCase() === "laptop"
          ? "Laptop"
          : rawName.toLowerCase() === "ricecooker" || rawName.toLowerCase() === "rice cooker"
          ? "Rice Cooker"
          : rawName.toLowerCase() === "fan" || rawName.toLowerCase() === "electric fan"
          ? "Electric Fan"
          : rawName;

      const quantity =
        Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0
          ? Number(item.quantity)
          : 1;

      const unitPrice =
        Number.isFinite(Number(item?.price)) && Number(item.price) >= 0
          ? Number(item.price)
          : Number.isFinite(Number(item?.monthlyFee)) && Number(item.monthlyFee) >= 0
          ? Number(item.monthlyFee)
          : Number.isFinite(Number(item?.unitPrice)) && Number(item.unitPrice) >= 0
          ? Number(item.unitPrice)
          : Number.isFinite(Number(item?.fee)) && Number(item.fee) >= 0
          ? Number(item.fee)
          : defaultUnitFee;

      const subtotal = unitPrice * quantity;
      const displayLabel = `${name} (${quantity}x) · ₱${unitPrice.toLocaleString()}/mo each (+₱${subtotal.toLocaleString()}/mo)`;

      return {
        id: item?.id || name,
        name,
        quantity,
        unitPrice,
        subtotal,
        displayLabel,
      };
    })
    .filter((it) => it.quantity > 0);

  const calculatedTotal = items.reduce((sum, it) => sum + it.subtotal, 0);
  const totalApplianceFees =
    calculatedTotal > 0 ? calculatedTotal : Number(rawApplianceFees) > 0 ? Number(rawApplianceFees) : 0;

  return {
    items,
    totalApplianceFees,
  };
}

/**
 * Calculates the guided 3-stage payment breakdown:
 * 1. Initial Reservation Deposit (paid in Step 4 to hold room, credited to move-in)
 * 2. Pre-Move-In Balance (1 Mo Advance + 1 Mo Deposit - Credited Reservation Deposit)
 * 3. Monthly Stay Rate (Base Room Rent + Itemized Add-on Appliances)
 */
export function calculatePaymentBreakdown({
  monthlyRent = 0,
  applianceFees = 0,
  selectedAppliances = [],
  reservationFeeAmount = 2000,
  room = {},
}) {
  const baseRent = Number(monthlyRent) > 0 ? Number(monthlyRent) : 0;
  const applianceBreakdown = resolveApplianceBreakdown(selectedAppliances, applianceFees, room);
  const resolvedApplianceFees = applianceBreakdown.totalApplianceFees;

  const resDeposit =
    Number.isFinite(Number(reservationFeeAmount)) && Number(reservationFeeAmount) > 0
      ? Number(reservationFeeAmount)
      : 2000;

  const advanceRent = baseRent;
  const securityDeposit = baseRent;
  const preMoveInGross = advanceRent + securityDeposit;
  const preMoveInNetCashout = Math.max(0, preMoveInGross - resDeposit);
  const monthlyStayRate = baseRent + resolvedApplianceFees;

  return {
    reservationDeposit: resDeposit,
    advanceRent,
    securityDeposit,
    preMoveInGross,
    preMoveInNetCashout,
    baseMonthlyRent: baseRent,
    applianceFees: resolvedApplianceFees,
    monthlyStayRate,
    applianceBreakdown,
  };
}


