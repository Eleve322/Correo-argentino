// ============================================================================
// MiCorreo v1 — API Client
// Correo Argentino · https://api.correoargentino.com.ar/micorreo/v1
// ============================================================================

import type {
  MiCorreoTokenResponse,
  MiCorreoRegisterRequest,
  MiCorreoRegisterResponse,
  MiCorreoValidateResponse,
  MiCorreoAgency,
  MiCorreoRateRequest,
  MiCorreoRateResponse,
  MiCorreoRate,
  MiCorreoShipmentRequest,
  MiCorreoShipmentResponse,
  MiCorreoTrackingResponse,
  MiCorreoTrackingError,
  MiCorreoErrorResponse,
} from "./micorreo-types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getConfig() {
  const baseUrl = process.env.MICORREO_API_URL;
  const user = process.env.MICORREO_USER;
  const password = process.env.MICORREO_PASSWORD;
  const customerId = process.env.MICORREO_CUSTOMER_ID;

  if (!baseUrl || !user || !password) {
    throw new Error(
      "Missing MiCorreo configuration. Set MICORREO_API_URL, MICORREO_USER, MICORREO_PASSWORD"
    );
  }

  return { baseUrl, user, password, customerId };
}

// ---------------------------------------------------------------------------
// JWT Token Management — Auto-refresh with in-memory cache
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;
let tokenExpiresAt: Date | null = null;

/**
 * Get a valid JWT token, refreshing if expired or about to expire.
 * Requests a new token if the current one expires within 5 minutes.
 */
export async function getToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiresAt) {
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    if (new Date().getTime() + bufferMs < tokenExpiresAt.getTime()) {
      return cachedToken;
    }
  }

  const { baseUrl, user, password } = getConfig();
  const credentials = Buffer.from(`${user}:${password}`).toString("base64");

  const res = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    cachedToken = null;
    tokenExpiresAt = null;
    throw new MiCorreoError(
      `Authentication failed (${res.status}): ${errorText}`,
      res.status
    );
  }

  const data = (await res.json()) as MiCorreoTokenResponse;
  cachedToken = data.token;

  // Parse expiry: "2026-05-10 15:42:04" format (field is "expire" not "expires")
  tokenExpiresAt = new Date(data.expire.replace(" ", "T") + "-03:00");

  console.log(
    `[MiCorreo] Token obtained, expires: ${data.expire}`
  );

  return cachedToken;
}

/** Force-clear cached token (useful for retries after 401) */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = null;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class MiCorreoError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: MiCorreoErrorResponse
  ) {
    super(message);
    this.name = "MiCorreoError";
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper with auto-retry on 401
// ---------------------------------------------------------------------------

async function miCorreoFetch<T>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {}
): Promise<T> {
  const { baseUrl } = getConfig();
  const { method = "GET", body, params } = options;

  let url = `${baseUrl}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        searchParams.set(key, value);
      }
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const token = await getToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // On 401, clear cache and retry once
  if (res.status === 401) {
    clearTokenCache();
    const retryToken = await getToken();

    const retryRes = await fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization: `Bearer ${retryToken}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!retryRes.ok) {
      const errorData = (await retryRes.json().catch(() => null)) as MiCorreoErrorResponse | null;
      throw new MiCorreoError(
        errorData?.message || `MiCorreo API error ${retryRes.status}`,
        retryRes.status,
        errorData || undefined
      );
    }

    return (await retryRes.json()) as T;
  }

  if (!res.ok) {
    const errorData = (await res.json().catch(() => null)) as MiCorreoErrorResponse | null;
    throw new MiCorreoError(
      errorData?.message || `MiCorreo API error ${res.status}`,
      res.status,
      errorData || undefined
    );
  }

  return (await res.json()) as T;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Validate MiCorreo credentials by attempting to get a token.
 * Returns true if successful, false otherwise.
 */
export async function validateCredentials(): Promise<boolean> {
  try {
    await getToken();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

/**
 * Register a new user in MiCorreo.
 * POST /register
 */
export async function registerUser(
  data: MiCorreoRegisterRequest
): Promise<MiCorreoRegisterResponse> {
  return miCorreoFetch<MiCorreoRegisterResponse>("/register", {
    method: "POST",
    body: data,
  });
}

/**
 * Validate an existing user and get their customerId.
 * POST /users/validate
 */
export async function validateUser(
  email: string,
  password: string
): Promise<MiCorreoValidateResponse> {
  return miCorreoFetch<MiCorreoValidateResponse>("/users/validate", {
    method: "POST",
    body: { email, password },
  });
}

// ---------------------------------------------------------------------------
// Agencies (Branch Offices)
// ---------------------------------------------------------------------------

/**
 * Get branch offices for a given province.
 * GET /agencies?customerId=...&provinceCode=...
 */
export async function getAgencies(
  provinceCode: string,
  services?: "package_reception" | "pickup_availability"
): Promise<MiCorreoAgency[]> {
  const { customerId } = getConfig();

  if (!customerId) {
    throw new MiCorreoError(
      "MICORREO_CUSTOMER_ID is required to list agencies",
      400
    );
  }

  const params: Record<string, string> = {
    customerId,
    provinceCode,
  };

  if (services) {
    params.services = services;
  }

  return miCorreoFetch<MiCorreoAgency[]>("/agencies", { params });
}

// ---------------------------------------------------------------------------
// Rates (Quotation)
// ---------------------------------------------------------------------------

/**
 * Get shipping rate quotes.
 * POST /rates
 *
 * If deliveredType is omitted, both home delivery ("D") and branch ("S") are returned.
 */
export async function getRates(
  params: Omit<MiCorreoRateRequest, "customerId"> & { customerId?: string }
): Promise<MiCorreoRate[]> {
  const config = getConfig();
  const customerId = params.customerId || config.customerId;

  if (!customerId) {
    throw new MiCorreoError(
      "MICORREO_CUSTOMER_ID is required to get rates",
      400
    );
  }

  const body: MiCorreoRateRequest = {
    customerId,
    postalCodeOrigin: params.postalCodeOrigin,
    postalCodeDestination: params.postalCodeDestination,
    dimensions: {
      weight: Math.round(params.dimensions.weight),
      height: Math.round(params.dimensions.height),
      width: Math.round(params.dimensions.width),
      length: Math.round(params.dimensions.length),
    },
  };

  // Include deliveredType only if specified
  if (params.deliveredType) {
    body.deliveredType = params.deliveredType;
  }

  const data = await miCorreoFetch<MiCorreoRateResponse>("/rates", {
    method: "POST",
    body,
  });

  return data.rates || [];
}

// ---------------------------------------------------------------------------
// Shipping Import (Create Shipment)
// ---------------------------------------------------------------------------

/**
 * Import/create a shipment in MiCorreo.
 * POST /shipping/import
 */
export async function importShipment(
  data: Omit<MiCorreoShipmentRequest, "customerId"> & { customerId?: string }
): Promise<MiCorreoShipmentResponse> {
  const config = getConfig();
  const customerId = data.customerId || config.customerId;

  if (!customerId) {
    throw new MiCorreoError(
      "MICORREO_CUSTOMER_ID is required to import shipments",
      400
    );
  }

  const body: MiCorreoShipmentRequest = {
    ...data,
    customerId,
    shipping: {
      ...data.shipping,
      // Ensure integer values as per API docs
      weight: Math.round(data.shipping.weight),
      height: Math.min(255, Math.round(data.shipping.height)),
      length: Math.min(255, Math.round(data.shipping.length)),
      width: Math.min(255, Math.round(data.shipping.width)),
      // Truncate floor/apartment to 3 chars as per API docs
      address: {
        ...data.shipping.address,
        floor: data.shipping.address.floor?.slice(0, 3),
        apartment: data.shipping.address.apartment?.slice(0, 3),
      },
    },
  };

  return miCorreoFetch<MiCorreoShipmentResponse>("/shipping/import", {
    method: "POST",
    body,
  });
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/**
 * Get tracking information for a shipment.
 * GET /shipping/tracking
 *
 * Note: The API docs show the endpoint path as "/shipping/trakcing" (typo),
 * but we try "/shipping/tracking" first, falling back to the typo version.
 */
export async function getTracking(
  shippingId: string
): Promise<MiCorreoTrackingResponse | MiCorreoTrackingResponse[]> {
  try {
    return await miCorreoFetch<MiCorreoTrackingResponse | MiCorreoTrackingResponse[]>(
      "/shipping/tracking",
      {
        method: "GET",
        body: { shippingId },
      }
    );
  } catch (error) {
    // Try the typo version from the docs if the correct one fails with 404
    if (error instanceof MiCorreoError && error.statusCode === 404) {
      return miCorreoFetch<MiCorreoTrackingResponse | MiCorreoTrackingResponse[]>(
        "/shipping/trakcing",
        {
          method: "GET",
          body: { shippingId },
        }
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helper: Parse Argentine phone numbers
// ---------------------------------------------------------------------------

/**
 * Known area codes by length (2, 3, and 4 digits).
 * Buenos Aires (11) is the only 2-digit code.
 * Major cities use 3 digits. Smaller cities use 4.
 *
 * Source: ENACOM / CNC area code list
 */
const AREA_CODES_2 = ["11"];
const AREA_CODES_3 = [
  "220","221","223","230","236","237","249","260","261","263","264","266",
  "280","291","294","297","298","299","336","341","342","343","345","348",
  "351","353","358","362","364","370","376","379","380","381","383","385",
  "387","388",
];

/**
 * Parse an Argentine phone number into area code and subscriber number.
 *
 * Input formats supported:
 *   - "+54 261 269-7483"
 *   - "+54 342 610-2586"
 *   - "54 261 3897785"
 *   - "0261-4551234"
 *   - "261 4551234"
 *   - "15 4551234" (local mobile without area code — returns empty areaCode)
 *
 * Output:
 *   - areaCode: "261" (sin 0)
 *   - subscriberNumber: "2697483" (sin 15)
 *
 * MiCorreo fields:
 *   - "Cód. Área (sin 0)" → areaCode
 *   - "Celular (sin 15)" → subscriberNumber
 */
export function parseArgentinePhone(rawPhone: string): {
  areaCode: string;
  subscriberNumber: string;
  fullFormatted: string; // "area + number" for the simple phone field
} {
  if (!rawPhone || !rawPhone.trim()) {
    return { areaCode: "", subscriberNumber: "", fullFormatted: "" };
  }

  // 1. Strip everything except digits
  let digits = rawPhone.replace(/[^\d]/g, "");

  // 2. Remove country code "54" from the start
  if (digits.startsWith("54") && digits.length > 10) {
    digits = digits.slice(2);
  }

  // 3. Remove leading "0" (trunk prefix)
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // 4. Remove mobile prefix "9" (used in international format +54 9 ...)
  //    Only if we still have >10 digits
  if (digits.startsWith("9") && digits.length > 10) {
    digits = digits.slice(1);
  }

  // 5. Remove "15" mobile prefix if it appears after area code
  //    "15" is always 2 digits and the subscriber part that follows is 8 digits
  //    But we need to detect it carefully — only remove if number is too long

  // 6. Try to identify area code
  let areaCode = "";
  let subscriberNumber = digits;

  // Check 2-digit area codes first (Buenos Aires = 11)
  for (const code of AREA_CODES_2) {
    if (digits.startsWith(code)) {
      areaCode = code;
      subscriberNumber = digits.slice(code.length);
      break;
    }
  }

  // Then 3-digit area codes (most major cities)
  if (!areaCode) {
    for (const code of AREA_CODES_3) {
      if (digits.startsWith(code)) {
        areaCode = code;
        subscriberNumber = digits.slice(code.length);
        break;
      }
    }
  }

  // Fallback: if no known area code matched, try heuristic
  // Argentine numbers are 10 digits total (area + subscriber)
  if (!areaCode && digits.length >= 10) {
    // Assume first 2-4 digits are area code based on total length
    // Standard: 10 digits = area(2-4) + subscriber(6-8)
    // Try 3-digit area code as default
    areaCode = digits.slice(0, 3);
    subscriberNumber = digits.slice(3);
  }

  // 7. Remove "15" from the start of subscriber number (mobile prefix)
  if (subscriberNumber.startsWith("15")) {
    subscriberNumber = subscriberNumber.slice(2);
  }

  const fullFormatted = areaCode
    ? `${areaCode}${subscriberNumber}`
    : subscriberNumber;

  return { areaCode, subscriberNumber, fullFormatted };
}

// ---------------------------------------------------------------------------
// Helper: Smart address parsing for Shopify → MiCorreo
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate delivery instructions (go to observations, NOT address).
 * Case-insensitive.
 */
const OBSERVATION_PATTERNS = [
  /port[oó]n\s+(negro|blanco|gris|marr[oó]n|verde|rojo|grande|chico)/i,
  /casa\s+(de\s+)?atr[aá]s/i,
  /timbre/i,
  /llamar/i,
  /golpear/i,
  /reja\s/i,
  /dejar\s+en/i,
  /al\s+fondo/i,
  /entre\s+(calle|av)/i,
  /esquina/i,
  /frente\s+a/i,
];

/**
 * Patterns that are part of the address (include in streetNumber).
 * "Lote 23", "Mza B", "Casa 5", "Parcela 10", "Nro 456", "Block A"
 */
const ADDRESS_PART_PATTERNS = [
  /^(lote|lt|mza|manzana|casa|parcela|parc|nro|block|bloque|torre|cuerpo|edif|edificio|barrio|bo|bario)\s*\.?\s*\S+/i,
];

/**
 * Smart address parser that handles messy Shopify address inputs.
 *
 * Cases handled:
 *   1. "Lateral Paso 2000" → street="Lateral Paso", number="2000"
 *   2. "Country Altos de la Ribera" (no number) → street="Country Altos de la Ribera", number="" (NO fake 0)
 *   3. address2="Lote 23" → becomes part of the street: "Country Altos de la Ribera Lote 23"
 *   4. address2="portón negro" → goes to observations
 *   5. "Calle Severo Del Castillo 0" → detects fake 0, street="Calle Severo Del Castillo", number=""
 */
export function parseShopifyAddress(
  address1: string,
  address2?: string
): {
  streetName: string;
  streetNumber: string;
  observations: string;
} {
  const addr1 = (address1 || "").trim();
  const addr2 = (address2 || "").trim();

  // --- Process address2 first: classify as address part vs observation ---
  let addr2AddressParts: string[] = [];
  let addr2Observations: string[] = [];

  if (addr2) {
    // Split address2 by comma in case it has multiple parts
    const parts = addr2.split(",").map((p) => p.trim()).filter(Boolean);

    for (const part of parts) {
      const isObservation = OBSERVATION_PATTERNS.some((p) => p.test(part));
      const isAddressPart = ADDRESS_PART_PATTERNS.some((p) => p.test(part));

      if (isObservation) {
        addr2Observations.push(part);
      } else if (isAddressPart) {
        addr2AddressParts.push(part);
      } else {
        // If it looks like a number or location identifier, it's address
        // If it's descriptive text, it's observation
        if (/\d/.test(part) && part.length < 30) {
          addr2AddressParts.push(part);
        } else if (part.length > 40) {
          addr2Observations.push(part);
        } else {
          // Short text without numbers — could be "Depto 3B" or "Barrio Norte"
          addr2AddressParts.push(part);
        }
      }
    }
  }

  // --- Parse address1: extract street name and number ---
  // Match: "Street Name 1234" or "Street Name 1234 bis" or "Street Name 1234-A"
  // The number must be at least 1 digit and appear at the end
  const streetMatch = addr1.match(/^(.+?)\s+(\d+(?:\s*(?:bis|[a-z]))?(?:\s*[-\/]\s*\w+)?)$/i);

  let streetName: string;
  let streetNumber: string;

  if (streetMatch) {
    streetName = streetMatch[1]!;
    streetNumber = streetMatch[2]!;

    // IMPORTANT: Reject fake "0" as a street number
    if (streetNumber === "0") {
      streetName = addr1; // Keep the full text
      streetNumber = "";
    }
  } else {
    // No number found — keep the entire address1 as street name
    streetName = addr1;
    streetNumber = "";
  }

  // --- Append address2 parts that belong in the address ---
  if (addr2AddressParts.length > 0) {
    const extraAddress = addr2AddressParts.join(", ");

    // If there's no street number and addr2 has a number-like part, use it as number
    // e.g. addr1="Country Altos de la Ribera", addr2="Lote 23"
    if (!streetNumber) {
      // Check if the first addr2 part starts with a location identifier
      const firstPart = addr2AddressParts[0]!;
      const isLocId = ADDRESS_PART_PATTERNS.some((p) => p.test(firstPart));
      if (isLocId) {
        // Append to street name: "Country Altos de la Ribera Lote 23"
        streetName = `${streetName} ${extraAddress}`.trim();
      } else {
        streetName = `${streetName} ${extraAddress}`.trim();
      }
    } else {
      // We already have a street number, put addr2 parts in observations
      addr2Observations.push(...addr2AddressParts);
    }
  }

  const observations = addr2Observations.join(", ");

  return { streetName, streetNumber, observations };
}

// ---------------------------------------------------------------------------
// Helper: Build shipment from Shopify order data
// ---------------------------------------------------------------------------

export interface ShopifyToShipmentInput {
  /** Shopify order name/number (e.g. "#1001") */
  orderName: string;
  /** Shopify order ID (numeric or GID) */
  orderId?: string;
  /** Recipient info */
  recipient: {
    name: string;
    email?: string;
    phone?: string;
    address1: string;
    address2?: string;
    city: string;
    provinceCode: string;
    zip: string;
  };
  /** Weight in grams */
  weightGrams: number;
  /** Dimensions in cm */
  dimensions?: { height: number; width: number; length: number };
  /** Declared value in ARS */
  declaredValue: number;
  /** "D" = home delivery, "S" = branch pickup */
  deliveryType?: "D" | "S";
  /** Branch code (required for deliveryType "S") */
  agencyCode?: string;
  /** Number of items (for dimension estimation) */
  itemCount?: number;
}

/**
 * Build a MiCorreo shipment request from Shopify order data.
 *
 * This function handles:
 *   - Smart address parsing (no fake "0" numbers)
 *   - Phone number parsing (area code + subscriber for MiCorreo)
 *   - Delivery instruction routing (observations)
 */
export function buildShipmentRequest(
  input: ShopifyToShipmentInput
): Omit<MiCorreoShipmentRequest, "customerId"> {
  // 1. Parse address intelligently
  const { streetName, streetNumber, observations } = parseShopifyAddress(
    input.recipient.address1,
    input.recipient.address2
  );

  // 2. Parse phone number into area code + subscriber
  const phone = parseArgentinePhone(input.recipient.phone || "");

  // 3. Estimate dimensions if not provided
  const dims = input.dimensions ?? estimateDimensionsFromWeight(input.weightGrams, input.itemCount || 1);

  // 4. Build observation text (address2 instructions + phone as backup)
  const observationParts: string[] = [];
  if (observations) observationParts.push(observations);

  console.log(
    `[Address] "${input.recipient.address1}" + "${input.recipient.address2 || ""}" → ` +
    `street="${streetName}" num="${streetNumber}" obs="${observations}"`
  );
  console.log(
    `[Phone] "${input.recipient.phone}" → area="${phone.areaCode}" num="${phone.subscriberNumber}"`
  );

  return {
    extOrderId: input.orderName.replace("#", ""),
    orderNumber: input.orderName,
    sender: {
      name: process.env.SENDER_NAME || null,
      phone: process.env.SENDER_PHONE || null,
      cellPhone: null,
      email: process.env.SENDER_EMAIL || null,
      // DO NOT include originAddress — MiCorreo interprets it as "Pickup" request
      // Without originAddress, MiCorreo uses the account's default (Suc. Martinez)
    },
    recipient: {
      name: input.recipient.name,
      // phone = "areaCode + subscriberNumber" (full number without +54 or 0 or 15)
      phone: phone.areaCode,
      // cellPhone = subscriber number without 15
      cellPhone: phone.subscriberNumber,
      email: input.recipient.email || "",
    },
    shipping: {
      deliveryType: input.deliveryType || "D",
      productType: "CP",
      agency: input.deliveryType === "S" ? (input.agencyCode || null) : null,
      address: {
        streetName,
        streetNumber,
        floor: "",
        apartment: observations || (input.recipient.address2 && !observations ? input.recipient.address2 : ""),
        city: input.recipient.city,
        provinceCode: input.recipient.provinceCode,
        postalCode: input.recipient.zip,
      },
      weight: Math.max(1, Math.round(input.weightGrams)),
      declaredValue: Math.round(input.declaredValue * 100) / 100,
      height: dims.height,
      length: dims.length,
      width: dims.width,
    },
  };
}

/**
 * Estimate package dimensions optimized for minimal volumetric weight.
 * Uses avg weight per item to distinguish clothing from shoes.
 *
 * RULES:
 *   - Clothing height NEVER exceeds 5cm
 *   - Shoes max 10cm height
 *   - Minimize dimensions to reduce volumetric weight charges
 */
function estimateDimensionsFromWeight(
  weightGrams: number,
  itemCount: number = 1
): { height: number; width: number; length: number } {
  const avgWeight = itemCount > 0 ? weightGrams / itemCount : weightGrams;

  // === CLOTHING / ACCESSORIES (≤400g per item) ===
  if (avgWeight <= 400) {
    if (weightGrams <= 200) return { height: 3, width: 15, length: 20 };
    if (itemCount <= 1)     return { height: 4, width: 25, length: 30 };
    if (itemCount <= 2)     return { height: 4, width: 25, length: 30 };
    return                         { height: 5, width: 25, length: 35 };
  }

  // === SHOES (400-900g per item) ===
  if (avgWeight <= 900) {
    if (itemCount <= 1) return { height: 10, width: 22, length: 33 };
    if (itemCount <= 2) return { height: 10, width: 30, length: 33 };
    return                     { height: 15, width: 30, length: 35 };
  }

  // === HEAVY ITEMS ===
  if (itemCount <= 1) return { height: 13, width: 25, length: 35 };
  return                     { height: 18, width: 30, length: 38 };
}
