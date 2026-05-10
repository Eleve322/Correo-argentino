// ============================================================================
// POST /api/webhooks/orders-paid
// Shopify webhook handler for when an order is paid
// Auto-imports shipment into MiCorreo
// ============================================================================

import { NextResponse } from "next/server";
import { importShipment, buildShipmentRequest } from "@/lib/micorreo";
import {
  verifyShopifyWebhook,
  addOrderMetafield,
  updateOrderNote,
} from "@/lib/shopify-admin";
import type { ShopifyOrderWebhook } from "@/lib/micorreo-types";

export async function POST(request: Request) {
  // 1. Read raw body for HMAC verification
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256") || "";

  // 2. Verify webhook authenticity
  if (process.env.SHIPPING_WEBHOOK_SECRET) {
    const isValid = await verifyShopifyWebhook(rawBody, hmacHeader);
    if (!isValid) {
      console.error("Invalid Shopify webhook HMAC");
      return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
    }
  }

  try {
    const order = JSON.parse(rawBody) as ShopifyOrderWebhook;

    console.log(
      `📦 Webhook received: Order ${order.name} (${order.financial_status})`
    );

    // 3. Check if the order uses Correo Argentino shipping
    const usesCorreoArgentino = order.shipping_lines?.some(
      (line) =>
        line.title.toLowerCase().includes("correo argentino") ||
        line.code?.toLowerCase().includes("correo-argentino")
    );

    if (!usesCorreoArgentino) {
      console.log(
        `Order ${order.name} does not use Correo Argentino shipping, skipping`
      );
      return NextResponse.json({
        status: "skipped",
        reason: "Not Correo Argentino shipping",
      });
    }

    // 4. Check we have a shipping address
    if (!order.shipping_address) {
      console.error(`Order ${order.name} has no shipping address`);
      return NextResponse.json({
        status: "error",
        reason: "No shipping address",
      });
    }

    // 5. Calculate total weight
    const totalWeightGrams = order.line_items.reduce(
      (sum, item) => sum + item.grams * item.quantity,
      0
    );

    // 6. Determine delivery type and agency code from shipping line
    const shippingLine = order.shipping_lines?.[0];
    const shippingTitle = shippingLine?.title?.toLowerCase() || "";
    const shippingCode = shippingLine?.code || "";
    const deliveryType: "D" | "S" = shippingTitle.includes("suc.")
      ? "S"
      : "D";

    // Extract agency code from service_code: "correo-argentino-sucursal-B0107" → "B0107"
    let agencyCode: string | undefined;
    if (deliveryType === "S") {
      const codeMatch = shippingCode.match(/correo-argentino-sucursal-(?:clásico-|clasico-)?(.+)/i);
      agencyCode = codeMatch?.[1];
      console.log(`📍 Branch pickup: agency code = ${agencyCode || "unknown"}`);
    }

    // 7. Build and import shipment to MiCorreo
    const addr = order.shipping_address;
    const shipmentData = buildShipmentRequest({
      orderName: order.name,
      orderId: String(order.id),
      recipient: {
        name: `${addr.first_name} ${addr.last_name}`.trim(),
        email: order.email || order.customer?.email,
        phone: addr.phone || order.customer?.phone || "",
        address1: addr.address1,
        address2: addr.address2 || undefined,
        city: addr.city,
        provinceCode: addr.province_code,
        zip: addr.zip,
      },
      weightGrams: Math.max(totalWeightGrams, 500),
      declaredValue: parseFloat(order.total_price),
      deliveryType,
      agencyCode,
    });

    console.log(`Importing shipment for order ${order.name}...`);
    const result = await importShipment(shipmentData);
    console.log(`✅ Shipment imported: ${result.createdAt}`);

    // 8. Update Shopify order with shipment info
    try {
      const extOrderId = order.name.replace("#", "");

      await addOrderMetafield(
        String(order.id),
        "correo_argentino",
        "shipment_id",
        extOrderId
      );

      await addOrderMetafield(
        String(order.id),
        "correo_argentino",
        "imported_at",
        result.createdAt
      );

      const notePrefix = order.note ? `${order.note}\n` : "";
      await updateOrderNote(
        String(order.id),
        `${notePrefix}📦 Correo Argentino - Envío importado (${result.createdAt})`
      );
    } catch (shopifyError) {
      console.error("Failed to update Shopify order:", shopifyError);
    }

    return NextResponse.json({
      status: "success",
      orderName: order.name,
      createdAt: result.createdAt,
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Always return 200 to Shopify to prevent retries
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
