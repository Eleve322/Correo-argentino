// ============================================================================
// GET /api/shipping/validate
// Validate MiCorreo credentials and connectivity
// ============================================================================

import { NextResponse } from "next/server";
import { validateCredentials } from "@/lib/micorreo";

export async function GET() {
  try {
    const isAuthenticated = await validateCredentials();

    return NextResponse.json({
      success: true,
      micorreo: {
        authenticated: isAuthenticated,
        apiUrl: process.env.MICORREO_API_URL || "NOT SET",
        userSet: !!process.env.MICORREO_USER,
        passwordSet: !!process.env.MICORREO_PASSWORD,
        customerId: process.env.MICORREO_CUSTOMER_ID || "NOT SET",
      },
      sender: {
        name: process.env.SENDER_NAME || "NOT SET",
        zipCode: process.env.SENDER_ZIPCODE || "NOT SET",
      },
      shopify: {
        domain: process.env.SHOPIFY_STORE_DOMAIN || "NOT SET",
        adminTokenSet: !!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
      },
    });
  } catch (error) {
    console.error("Validation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
