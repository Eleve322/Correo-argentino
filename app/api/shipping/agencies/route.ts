// ============================================================================
// GET /api/shipping/agencies
// List Correo Argentino branch offices via MiCorreo API
// ============================================================================

import { NextResponse } from "next/server";
import { getAgencies } from "@/lib/micorreo";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const provinceCode = searchParams.get("provinceCode");

    if (!provinceCode) {
      return NextResponse.json(
        { error: "provinceCode query parameter is required (e.g. B, C, X)" },
        { status: 400 }
      );
    }

    const agencies = await getAgencies(provinceCode);

    return NextResponse.json({
      success: true,
      count: agencies.length,
      agencies: agencies.map((a) => ({
        code: a.code,
        name: a.name,
        manager: a.manager,
        phone: a.phone,
        email: a.email,
        status: a.status,
        services: {
          canPickup: a.services.pickupAvailability,
          canReceive: a.services.packageReception,
        },
        address: {
          street: a.location.address.streetName,
          number: a.location.address.streetNumber,
          locality: a.location.address.locality,
          city: a.location.address.city,
          province: a.location.address.province,
          zipCode: a.location.address.postalCode,
        },
        coordinates: {
          lat: parseFloat(a.location.latitude),
          lng: parseFloat(a.location.longitude),
        },
        hours: a.hours,
      })),
    });
  } catch (error) {
    console.error("Agencies error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to get agencies", details: message },
      { status: 500 }
    );
  }
}
