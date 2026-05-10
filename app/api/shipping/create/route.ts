// ============================================================================
// POST /api/shipping/create
// Import a shipment into MiCorreo and update Shopify order
// ============================================================================

import { NextResponse } from "next/server";
import { importShipment, buildShipmentRequest } from "@/lib/micorreo";
import { addOrderMetafield, updateOrderNote } from "@/lib/shopify-admin";

function verifyApiSecret(request: Request): boolean {
  const secret = request.headers.get("x-shipping-secret");
  return secret === process.env.SHIPPING_API_SECRET;
}

export async function POST(request: Request) {
  // Verify API secret
  if (process.env.SHIPPING_API_SECRET && !verifyApiSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const {
      orderName,
      orderId,
      recipient,
      weightGrams = 1000,
      dimensions,
      declaredValue,
      deliveryType = "D",
      agencyCode,
    } = body;

    if (!recipient || !recipient.name || !recipient.address1 || !recipient.zip) {
      return NextResponse.json(
        { error: "Missing required recipient data (name, address1, zip)" },
        { status: 400 }
      );
    }

    if (!recipient.email) {
      return NextResponse.json(
        { error: "Missing required recipient email" },
        { status: 400 }
      );
    }

    // 1. Build MiCorreo shipment request from input
    const shipmentData = buildShipmentRequest({
      orderName: orderName || "",
      orderId,
      recipient: {
        name: recipient.name,
        email: recipient.email,
        phone: recipient.phone,
        address1: recipient.address1,
        address2: recipient.address2,
        city: recipient.city,
        provinceCode: recipient.provinceCode,
        zip: recipient.zip,
      },
      weightGrams,
      dimensions,
      declaredValue: declaredValue || 0,
      deliveryType,
      agencyCode,
    });

    // 2. Import shipment to MiCorreo
    const result = await importShipment(shipmentData);

    // 3. Update Shopify order if orderId is provided
    if (orderId) {
      try {
        const extOrderId = (orderName || "").replace("#", "");

        await addOrderMetafield(
          orderId,
          "correo_argentino",
          "shipment_id",
          extOrderId
        );

        await addOrderMetafield(
          orderId,
          "correo_argentino",
          "created_at",
          result.createdAt
        );

        const noteText = `📦 Correo Argentino - Envío importado (${result.createdAt})`;
        await updateOrderNote(orderId, noteText);
      } catch (shopifyError) {
        console.error("Failed to update Shopify order:", shopifyError);
        // Don't fail the whole request — shipment was created successfully
      }
    }

    return NextResponse.json({
      success: true,
      createdAt: result.createdAt,
      extOrderId: (orderName || "").replace("#", ""),
    });
  } catch (error) {
    console.error("Create shipment error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create shipment", details: message },
      { status: 500 }
    );
  }
}
