// ============================================================================
// POST /api/shipping/rates
// Shopify Carrier Service Callback
// Called by Shopify during checkout to get shipping rates
// ============================================================================

import { NextResponse } from "next/server";
import { getRates, getAgencies } from "@/lib/micorreo";
import { getFixedRates } from "@/lib/shipping-rates-table";
import type {
  ShopifyCarrierRequest,
  ShopifyCarrierResponse,
  MiCorreoAgency,
} from "@/lib/micorreo-types";

// Map Shopify province names → MiCorreo province codes
const PROVINCE_CODE_MAP: Record<string, string> = {
  "buenos aires": "B",
  "capital federal": "C",
  "ciudad autonoma de buenos aires": "C",
  "ciudad autónoma de buenos aires": "C",
  caba: "C",
  catamarca: "K",
  chaco: "H",
  chubut: "U",
  cordoba: "X",
  córdoba: "X",
  corrientes: "W",
  "entre rios": "E",
  "entre ríos": "E",
  formosa: "P",
  jujuy: "Y",
  "la pampa": "L",
  "la rioja": "F",
  mendoza: "M",
  misiones: "N",
  neuquen: "Q",
  neuquén: "Q",
  "rio negro": "R",
  "río negro": "R",
  salta: "A",
  "san juan": "J",
  "san luis": "D",
  "santa cruz": "Z",
  "santa fe": "S",
  "santiago del estero": "G",
  "tierra del fuego": "V",
  tucuman: "T",
  tucumán: "T",
};

function getProvinceCode(province: string): string | null {
  if (!province) return null;
  // If it's already a single letter code
  if (province.length <= 2) return province.toUpperCase();
  return PROVINCE_CODE_MAP[province.toLowerCase().trim()] || null;
}

/**
 * Find the closest agency to a given postal code from a list.
 * Strategy: match by postal code prefix (more digits = closer match).
 */
function findClosestAgency(
  agencies: MiCorreoAgency[],
  destinationPostalCode: string
): MiCorreoAgency | null {
  if (!agencies.length) return null;

  const destZip = destinationPostalCode.replace(/\D/g, ""); // Normalize to digits only

  // Try progressively shorter prefix matches
  for (let len = destZip.length; len >= 2; len--) {
    const prefix = destZip.slice(0, len);
    const match = agencies.find((a) => {
      const agencyZip = a.location?.address?.postalCode?.replace(/\D/g, "") || "";
      return agencyZip.startsWith(prefix);
    });
    if (match) return match;
  }

  // Fallback: return the first active agency
  return agencies.find((a) => a.status === "ACTIVE") || agencies[0];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ShopifyCarrierRequest;
    const { destination, items, currency } = body.rate;

    // Calculate total weight in grams
    const totalWeightGrams = items.reduce(
      (sum, item) => sum + item.grams * item.quantity,
      0
    );

    // Use a minimum weight if products don't have weight set
    const effectiveWeight = Math.max(totalWeightGrams, 500);

    // Default dimensions for the package (cm)
    const defaultDimensions = { height: 15, width: 30, length: 40 };

    let rates: ShopifyCarrierResponse["rates"] = [];

    // Try MiCorreo API for dynamic rates
    const hasMiCorreoConfig =
      process.env.MICORREO_API_URL &&
      process.env.MICORREO_USER &&
      process.env.MICORREO_PASSWORD &&
      process.env.MICORREO_CUSTOMER_ID;

    if (hasMiCorreoConfig) {
      try {
        const miCorreoRates = await getRates({
          postalCodeOrigin: process.env.SENDER_ZIPCODE || "",
          postalCodeDestination: destination.postal_code,
          dimensions: {
            weight: effectiveWeight,
            ...defaultDimensions,
          },
        });

        // Look up nearest agency for branch pickup rates
        let nearestAgency: MiCorreoAgency | null = null;
        const hasBranchRates = miCorreoRates.some((r) => r.deliveredType === "S");

        if (hasBranchRates) {
          try {
            const provinceCode = getProvinceCode(destination.province || "");
            if (provinceCode) {
              const agencies = await getAgencies(provinceCode);
              nearestAgency = findClosestAgency(agencies, destination.postal_code);
            }
          } catch (err) {
            console.warn("[Rates] Failed to fetch agencies for branch info:", err);
          }
        }

        // Build agency label for branch pickup
        const agencyLabel = nearestAgency
          ? ` — Suc. ${nearestAgency.name}${
              nearestAgency.location?.address?.streetName
                ? ` (${nearestAgency.location.address.streetName} ${nearestAgency.location.address.streetNumber || ""})`
                : ""
            }`.trim()
          : "";

        rates = miCorreoRates.map((rate) => {
          const isHomeDelivery = rate.deliveredType === "D";
          const productLabel =
            rate.productName?.toLowerCase().includes("expres") ? "Express" : "Clásico";

          return {
            service_name: isHomeDelivery
              ? `Correo Argentino ${productLabel} — Envío a domicilio`
              : `Correo Argentino ${productLabel} — Retiro en sucursal${agencyLabel}`,
            service_code: isHomeDelivery
              ? `correo-argentino-domicilio-${productLabel.toLowerCase()}`
              : `correo-argentino-sucursal-${productLabel.toLowerCase()}`,
            total_price: Math.round(rate.price * 100), // Shopify needs cents
            currency: currency || "ARS",
            description: `${rate.deliveryTimeMin}-${rate.deliveryTimeMax} días hábiles`,
          };
        });
      } catch (error) {
        console.error(
          "MiCorreo API failed, falling back to fixed rates:",
          error
        );
      }
    }

    // Fallback to fixed rate table
    if (rates.length === 0) {
      const fixedRates = getFixedRates(
        destination.postal_code,
        effectiveWeight
      );

      rates = fixedRates.map((rate) => ({
        service_name: rate.service,
        service_code: rate.serviceCode,
        total_price: Math.round(rate.price * 100), // Shopify needs cents
        currency: currency || "ARS",
        description: rate.deliveryDays,
      }));
    }

    return NextResponse.json({ rates });
  } catch (error) {
    console.error("Shipping rates error:", error);
    // Return empty rates on error — Shopify will show other shipping methods
    return NextResponse.json({ rates: [] });
  }
}
