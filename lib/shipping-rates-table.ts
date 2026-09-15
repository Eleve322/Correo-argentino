// ============================================================================
// Fallback Shipping Rates Table
// Used when MiCorreo API is unavailable or not configured
// Rates are estimated based on weight zones and destination
// ============================================================================

interface RateZone {
  name: string;
  /** Regex matching postal codes for this zone */
  cpPattern: RegExp;
  /** Price multiplier relative to base rate */
  multiplier: number;
  /** Estimated delivery days */
  deliveryDays: string;
}

/**
 * Shipping zones based on Argentine postal code ranges.
 * Zone 0: CABA
 * Zone 1: GBA (Greater Buenos Aires)
 * Zone 2: Near Interior (Buenos Aires, Santa Fe, Córdoba, Entre Ríos, etc.)
 * Zone 3: Mid Interior (Mendoza, Tucumán, Salta, etc.)
 * Zone 4: Far Interior (Patagonia, NEA, etc.)
 */
const ZONES: RateZone[] = [
  {
    name: "CABA",
    cpPattern: /^C?\d{4}[A-Z]{3}$|^1[0-4]\d{2}$/i,
    multiplier: 1.0,
    deliveryDays: "2-4 días hábiles",
  },
  {
    name: "GBA",
    cpPattern: /^1[5-9]\d{2}$|^B?\d{4}[A-Z]{3}$/i,
    multiplier: 1.1,
    deliveryDays: "3-5 días hábiles",
  },
  {
    name: "Interior Cercano",
    // Buenos Aires interior, Santa Fe, Córdoba, Entre Ríos
    cpPattern: /^[2-3]\d{3}$|^5\d{3}$|^6\d{3}$/,
    multiplier: 1.3,
    deliveryDays: "4-7 días hábiles",
  },
  {
    name: "Interior Medio",
    // Mendoza, Tucumán, Salta, Jujuy, San Juan, San Luis, La Rioja, Catamarca, Santiago del Estero
    cpPattern: /^4[0-5]\d{2}$|^5[5-9]\d{2}$|^7\d{3}$/,
    multiplier: 1.5,
    deliveryDays: "5-8 días hábiles",
  },
  {
    name: "Interior Lejano",
    // Patagonia, NEA, Formosa, Misiones, Corrientes, Chaco
    cpPattern: /^[89]\d{3}$|^3[5-9]\d{2}$/,
    multiplier: 1.8,
    deliveryDays: "7-12 días hábiles",
  },
];

/**
 * Base rate table by weight range (in grams).
 * These are approximate base prices in ARS.
 * Should be updated periodically to match Correo Argentino's actual rates.
 */
const WEIGHT_RATES: { maxGrams: number; basePrice: number }[] = [
  { maxGrams: 500, basePrice: 2500 },
  { maxGrams: 1000, basePrice: 3200 },
  { maxGrams: 2000, basePrice: 4000 },
  { maxGrams: 3000, basePrice: 4800 },
  { maxGrams: 5000, basePrice: 5500 },
  { maxGrams: 10000, basePrice: 7000 },
  { maxGrams: 15000, basePrice: 8500 },
  { maxGrams: 20000, basePrice: 10000 },
  { maxGrams: 25000, basePrice: 12000 },
  { maxGrams: 99999, basePrice: 15000 },
];

/**
 * Determine the shipping zone for a given postal code.
 */
function getZone(postalCode: string): RateZone {
  // Normalize: remove leading letters and trailing letters for CPA format
  const normalized = postalCode.replace(/^[A-Z]/i, "").replace(/[A-Z]+$/i, "");

  for (const zone of ZONES) {
    if (zone.cpPattern.test(postalCode) || zone.cpPattern.test(normalized)) {
      return zone;
    }
  }

  // Default to farthest zone if unknown
  return ZONES[ZONES.length - 1]!;
}

/**
 * Get the base price for a given weight.
 */
function getBasePrice(weightGrams: number): number {
  const clampedWeight = Math.max(1, weightGrams);

  for (const tier of WEIGHT_RATES) {
    if (clampedWeight <= tier.maxGrams) {
      return tier.basePrice;
    }
  }

  return WEIGHT_RATES[WEIGHT_RATES.length - 1]!.basePrice;
}

/**
 * Calculate a fixed shipping rate based on destination postal code and package weight.
 * This is a fallback when the MiCorreo API is unavailable.
 *
 * @param destinationZip - Destination postal code
 * @param weightGrams - Total package weight in grams
 * @returns Object with price (in ARS), zone name, and estimated delivery days
 */
export function calculateFixedRate(
  destinationZip: string,
  weightGrams: number
): {
  price: number;
  zoneName: string;
  deliveryDays: string;
} {
  const zone = getZone(destinationZip);
  const basePrice = getBasePrice(weightGrams);
  const price = Math.round(basePrice * zone.multiplier);

  return {
    price,
    zoneName: zone.name,
    deliveryDays: zone.deliveryDays,
  };
}

/**
 * Get all available fixed rates for a destination (home delivery + branch pickup).
 * Branch pickup is typically cheaper.
 */
export function getFixedRates(
  destinationZip: string,
  weightGrams: number
): {
  service: string;
  serviceCode: string;
  price: number;
  deliveryDays: string;
}[] {
  const homeRate = calculateFixedRate(destinationZip, weightGrams);

  const rates = [
    {
      service: "Envío a domicilio — Correo Argentino",
      serviceCode: "correo-argentino-domicilio",
      price: homeRate.price,
      deliveryDays: homeRate.deliveryDays,
    },
    {
      service: "Retiro en sucursal — Correo Argentino",
      serviceCode: "correo-argentino-sucursal",
      price: Math.round(homeRate.price * 0.75), // 25% cheaper for branch pickup
      deliveryDays: homeRate.deliveryDays,
    },
  ];

  return rates;
}
