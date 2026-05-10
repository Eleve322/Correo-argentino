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
}

/**
 * Build a MiCorreo shipment request from Shopify order data.
 */
export function buildShipmentRequest(
  input: ShopifyToShipmentInput
): Omit<MiCorreoShipmentRequest, "customerId"> {
  // Parse street name and number from address1
  const addressMatch = input.recipient.address1.match(/^(.+?)\s+(\d+.*)$/);
  const streetName = addressMatch ? addressMatch[1] : input.recipient.address1;
  const streetNumber = addressMatch ? addressMatch[2] : "S/N";

  // Estimate dimensions if not provided, based on weight
  const dims = input.dimensions ?? estimateDimensionsFromWeight(input.weightGrams);

  return {
    extOrderId: input.orderName.replace("#", ""),
    orderNumber: input.orderName,
    sender: {
      name: process.env.SENDER_NAME || null,
      phone: process.env.SENDER_PHONE || null,
      cellPhone: null,
      email: process.env.SENDER_EMAIL || null,
      originAddress: {
        streetName: process.env.SENDER_STREET || null,
        streetNumber: process.env.SENDER_STREET_NUMBER || null,
        floor: null,
        apartment: null,
        city: process.env.SENDER_CITY || null,
        provinceCode: process.env.SENDER_STATE || null,
        postalCode: process.env.SENDER_ZIPCODE || null,
      },
    },
    recipient: {
      name: input.recipient.name,
      phone: input.recipient.phone || "",
      cellPhone: "",
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
        apartment: input.recipient.address2 || "",
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
 * Estimate package dimensions from weight alone (for shipment import).
 * Calibrated for shoe/apparel e-commerce.
 */
function estimateDimensionsFromWeight(
  weightGrams: number
): { height: number; width: number; length: number } {
  if (weightGrams <= 300)  return { height: 5,  width: 15, length: 20 }; // socks, accessories
  if (weightGrams <= 600)  return { height: 8,  width: 20, length: 25 }; // small item
  if (weightGrams <= 1200) return { height: 13, width: 22, length: 35 }; // 1 shoe box
  if (weightGrams <= 2500) return { height: 26, width: 22, length: 35 }; // 2 shoe boxes
  if (weightGrams <= 3500) return { height: 30, width: 25, length: 38 }; // 3 items
  return { height: 35, width: 30, length: 42 };                          // 4+ items
}
