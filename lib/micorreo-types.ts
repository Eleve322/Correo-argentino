// ============================================================================
// MiCorreo v1 — API Types
// Correo Argentino · https://api.correoargentino.com.ar/micorreo/v1
// ============================================================================

// ---------------------------------------------------------------------------
// Province Codes (ISO 3166-2:AR single-letter)
// ---------------------------------------------------------------------------

export const PROVINCE_CODES = {
  A: "Salta",
  B: "Provincia de Buenos Aires",
  C: "Ciudad Autónoma de Buenos Aires",
  D: "San Luis",
  E: "Entre Ríos",
  F: "La Rioja",
  G: "Santiago del Estero",
  H: "Chaco",
  J: "San Juan",
  K: "Catamarca",
  L: "La Pampa",
  M: "Mendoza",
  N: "Misiones",
  P: "Formosa",
  Q: "Neuquén",
  R: "Río Negro",
  S: "Santa Fe",
  T: "Tucumán",
  U: "Chubut",
  V: "Tierra del Fuego",
  W: "Corrientes",
  X: "Córdoba",
  Y: "Jujuy",
  Z: "Santa Cruz",
} as const;

export type ProvinceCode = keyof typeof PROVINCE_CODES;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface MiCorreoTokenResponse {
  token: string;
  /** API returns "expire" (not "expires") — e.g. "2026-05-10 15:42:04" */
  expire: string;
}

// ---------------------------------------------------------------------------
// Register / Validate User
// ---------------------------------------------------------------------------

export interface MiCorreoAddress {
  streetName: string;
  streetNumber: string;
  floor?: string;
  apartment?: string;
  locality?: string;
  city: string;
  provinceCode: ProvinceCode | string;
  postalCode: string;
}

export interface MiCorreoRegisterRequest {
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
  documentType: "DNI" | "CUIT";
  documentId: string;
  phone?: string;
  cellPhone?: string;
  address?: MiCorreoAddress;
}

export interface MiCorreoRegisterResponse {
  customerId: string;
  createdAt: string;
}

export interface MiCorreoValidateRequest {
  email: string;
  password: string;
}

export interface MiCorreoValidateResponse {
  customerId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Agencies (Branch Offices)
// ---------------------------------------------------------------------------

export interface MiCorreoAgencyHours {
  start: string; // "0930"
  end: string;   // "1800"
}

export interface MiCorreoAgency {
  code: string;
  name: string;
  manager: string;
  email: string;
  phone: string;
  services: {
    packageReception: boolean;
    pickupAvailability: boolean;
  };
  location: {
    address: {
      streetName: string;
      streetNumber: string;
      floor: string | null;
      apartment: string | null;
      locality: string;
      city: string;
      province: string;
      provinceCode: string;
      postalCode: string;
    };
    latitude: string;
    longitude: string;
  };
  hours: {
    sunday: MiCorreoAgencyHours | null;
    monday: MiCorreoAgencyHours | null;
    tuesday: MiCorreoAgencyHours | null;
    wednesday: MiCorreoAgencyHours | null;
    thursday: MiCorreoAgencyHours | null;
    friday: MiCorreoAgencyHours | null;
    saturday: MiCorreoAgencyHours | null;
    holidays: MiCorreoAgencyHours | null;
  };
  status: string;
}

// ---------------------------------------------------------------------------
// Rates (Quotation)
// ---------------------------------------------------------------------------

export interface MiCorreoRateRequest {
  customerId: string;
  postalCodeOrigin: string;
  postalCodeDestination: string;
  /** "D" = home delivery, "S" = branch pickup, omit = both */
  deliveredType?: "D" | "S";
  dimensions: {
    /** Weight in grams (1–25000) */
    weight: number;
    /** Height in cm (max 150) */
    height: number;
    /** Width in cm (max 150) */
    width: number;
    /** Length in cm (max 150) */
    length: number;
  };
}

export interface MiCorreoRate {
  deliveredType: "D" | "S";
  productType: string;
  productName: string;
  price: number;
  deliveryTimeMin: string;
  deliveryTimeMax: string;
}

export interface MiCorreoRateResponse {
  customerId: string;
  validTo: string;
  rates: MiCorreoRate[];
}

// ---------------------------------------------------------------------------
// Shipping Import (Create Shipment)
// ---------------------------------------------------------------------------

export interface MiCorreoShipmentAddress {
  streetName: string;
  streetNumber: string;
  floor?: string;
  apartment?: string;
  city: string;
  provinceCode: ProvinceCode | string;
  postalCode: string;
}

export interface MiCorreoShipmentRequest {
  customerId: string;
  extOrderId: string;
  orderNumber?: string;
  sender?: {
    name?: string | null;
    phone?: string | null;
    cellPhone?: string | null;
    email?: string | null;
    /** "S" = drop off at branch (sucursal), "P" = pickup from address */
    admissionType?: "S" | "P";
    /** Branch code for drop-off (when admissionType = "S") */
    originAgency?: string | null;
    originAddress?: {
      streetName?: string | null;
      streetNumber?: string | null;
      floor?: string | null;
      apartment?: string | null;
      city?: string | null;
      provinceCode?: string | null;
      postalCode?: string | null;
    };
  };
  recipient: {
    name: string;
    phone?: string;
    cellPhone?: string;
    email: string;
  };
  shipping: {
    /** "D" = home delivery, "S" = branch pickup */
    deliveryType: "D" | "S";
    /** Default "CP" (Clasico) */
    productType: string;
    /** Branch code — required when deliveryType = "S" */
    agency?: string | null;
    address: MiCorreoShipmentAddress;
    /** Observations — maps to "Observaciones (opcional)" in MiCorreo form */
    observations?: string;
    /** Weight in grams (integer) */
    weight: number;
    /** Declared value in ARS */
    declaredValue: number;
    /** Height in cm (integer, 0–255) */
    height: number;
    /** Length in cm (integer, 0–255) */
    length: number;
    /** Width in cm (integer, 0–255) */
    width: number;
  };
}

export interface MiCorreoShipmentResponse {
  createdAt: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export interface MiCorreoTrackingEvent {
  event: string;
  date: string; // "DD-MM-YYYY HH:mm"
  branch: string;
  status: string;
  sign: string;
}

export interface MiCorreoTrackingResponse {
  id: string | null;
  productId: string | null;
  trackingNumber: string;
  events: MiCorreoTrackingEvent[];
}

export interface MiCorreoTrackingError {
  date: string;
  error: string;
  code: string;
}

// ---------------------------------------------------------------------------
// API Error
// ---------------------------------------------------------------------------

export interface MiCorreoErrorResponse {
  code: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Shopify Carrier Service — Callback types (kept from previous impl)
// ---------------------------------------------------------------------------

export interface ShopifyCarrierRequestItem {
  name: string;
  sku: string;
  quantity: number;
  grams: number;
  price: number;
  vendor: string;
  requires_shipping: boolean;
  taxable: boolean;
  fulfillment_service: string;
  properties: Record<string, string>;
  product_id: number;
  variant_id: number;
}

export interface ShopifyCarrierRequestAddress {
  country: string;
  postal_code: string;
  province: string;
  city: string;
  name: string | null;
  address1: string;
  address2: string;
  address3: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address_type: string | null;
  company_name: string | null;
}

export interface ShopifyCarrierRequest {
  rate: {
    origin: ShopifyCarrierRequestAddress;
    destination: ShopifyCarrierRequestAddress;
    items: ShopifyCarrierRequestItem[];
    currency: string;
    locale: string;
  };
}

export interface ShopifyCarrierRate {
  service_name: string;
  service_code: string;
  total_price: number; // in cents
  currency: string;
  description?: string;
  phone_required?: boolean;
  min_delivery_date?: string;
  max_delivery_date?: string;
}

export interface ShopifyCarrierResponse {
  rates: ShopifyCarrierRate[];
}

// ---------------------------------------------------------------------------
// Shopify Webhook — Order Paid payload (simplified)
// ---------------------------------------------------------------------------

export interface ShopifyOrderWebhook {
  id: number;
  name: string;
  email: string;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  shipping_lines: {
    code: string;
    title: string;
    price: string;
    source: string;
  }[];
  shipping_address: {
    first_name: string;
    last_name: string;
    name: string;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    province_code: string;
    zip: string;
    country: string;
    country_code: string;
    phone: string | null;
    company: string | null;
  };
  line_items: {
    id: number;
    title: string;
    quantity: number;
    price: string;
    grams: number;
    sku: string;
    variant_id: number;
    product_id: number;
    vendor: string;
  }[];
  note: string | null;
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  };
}
