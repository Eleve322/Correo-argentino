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
 * Find the N closest agencies to a given postal code.
 * Strategy: score each by postal code prefix match length, sort descending.
 */
function findClosestAgencies(
  agencies: MiCorreoAgency[],
  destinationPostalCode: string,
  count: number = 3
): MiCorreoAgency[] {
  if (!agencies.length) return [];

  const destZip = destinationPostalCode.replace(/\D/g, "");

  // Score each agency by how many leading digits match
  const scored = agencies
    .filter((a) => a.status === "ACTIVE")
    .map((a) => {
      const agencyZip = a.location?.address?.postalCode?.replace(/\D/g, "") || "";
      let matchLen = 0;
      for (let i = 0; i < Math.min(destZip.length, agencyZip.length); i++) {
        if (destZip[i] === agencyZip[i]) matchLen++;
        else break;
      }
      return { agency: a, matchLen };
    })
    .sort((a, b) => b.matchLen - a.matchLen);

  return scored.slice(0, count).map((s) => s.agency);
}

function agencyLabel(agency: MiCorreoAgency): string {
  const street = agency.location?.address?.streetName || "";
  const number = agency.location?.address?.streetNumber || "";
  const locality = agency.location?.address?.locality || "";
  const addr = street ? `${street} ${number}`.trim() : locality;
  return `Suc. ${agency.name}${addr ? ` (${addr})` : ""}`;
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

        // Look up the 3 closest agencies for branch pickup rates
        let closestAgencies: MiCorreoAgency[] = [];
        const hasBranchRates = miCorreoRates.some((r) => r.deliveredType === "S");

        if (hasBranchRates) {
          try {
            const provinceCode = getProvinceCode(destination.province || "");
            if (provinceCode) {
              const allAgencies = await getAgencies(provinceCode);
              closestAgencies = findClosestAgencies(allAgencies, destination.postal_code, 3);
            }
          } catch (err) {
            console.warn("[Rates] Failed to fetch agencies for branch info:", err);
          }
        }

        // Build Shopify rates
        for (const rate of miCorreoRates) {
          const isHomeDelivery = rate.deliveredType === "D";
          const productLabel =
            rate.productName?.toLowerCase().includes("expres") ? "Express" : "Clásico";
          const timeDesc = `${rate.deliveryTimeMin}-${rate.deliveryTimeMax} días hábiles`;
          const priceInCents = Math.round(rate.price * 100);

          if (isHomeDelivery) {
            // Home delivery: single rate
            rates.push({
              service_name: `Correo Argentino ${productLabel} — Envío a domicilio`,
              service_code: `correo-argentino-domicilio-${productLabel.toLowerCase()}`,
              total_price: priceInCents,
              currency: currency || "ARS",
              description: timeDesc,
            });
          } else if (closestAgencies.length > 0) {
            // Branch pickup: one rate per closest agency
            for (const agency of closestAgencies) {
              rates.push({
                service_name: `Correo Argentino ${productLabel} — ${agencyLabel(agency)}`,
                service_code: `correo-argentino-sucursal-${productLabel.toLowerCase()}-${agency.code}`,
                total_price: priceInCents,
                currency: currency || "ARS",
                description: timeDesc,
              });
            }
          } else {
            // No agencies found: generic branch rate
            rates.push({
              service_name: `Correo Argentino ${productLabel} — Retiro en sucursal`,
              service_code: `correo-argentino-sucursal-${productLabel.toLowerCase()}`,
              total_price: priceInCents,
              currency: currency || "ARS",
              description: timeDesc,
            });
          }
        }
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
