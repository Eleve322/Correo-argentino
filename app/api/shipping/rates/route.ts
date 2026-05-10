// ============================================================================
// POST /api/shipping/rates
// Shopify Carrier Service Callback
// Called by Shopify during checkout to get shipping rates
// ============================================================================

import { NextResponse } from "next/server";
import { getRates } from "@/lib/micorreo";
import { getFixedRates } from "@/lib/shipping-rates-table";
import type {
  ShopifyCarrierRequest,
  ShopifyCarrierResponse,
} from "@/lib/micorreo-types";

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

        rates = miCorreoRates.map((rate) => {
          const isHomeDelivery = rate.deliveredType === "D";
          return {
            service_name: isHomeDelivery
              ? "Correo Argentino - Envío a domicilio"
              : "Correo Argentino - Retiro en sucursal",
            service_code: isHomeDelivery
              ? "correo-argentino-domicilio"
              : "correo-argentino-sucursal",
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
