// ============================================================================
// POST /api/shipping/tracking
// Query tracking history for a shipment via MiCorreo
// ============================================================================

import { NextResponse } from "next/server";
import { getTracking } from "@/lib/micorreo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { shippingId } = body;

    if (!shippingId) {
      return NextResponse.json(
        { error: "shippingId is required" },
        { status: 400 }
      );
    }

    const result = await getTracking(shippingId);

    // API can return array or single object
    const trackingItems = Array.isArray(result) ? result : [result];

    return NextResponse.json({
      success: true,
      tracking: trackingItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        trackingNumber: item.trackingNumber,
        eventCount: item.events.length,
        events: item.events.map((e) => ({
          event: e.event,
          date: e.date,
          branch: e.branch,
          status: e.status,
          sign: e.sign,
        })),
      })),
    });
  } catch (error) {
    console.error("Tracking error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Check if it's a "no existe" error from MiCorreo
    if (message.includes("No existe")) {
      return NextResponse.json(
        { success: false, error: "Shipment not found", details: message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get tracking", details: message },
      { status: 500 }
    );
  }
}
