// ============================================================================
// POST /api/shipping/return
// Generate a return shipment in MiCorreo
// Swaps sender/recipient: customer sends → store receives
// Customer drops off at nearest branch, store gets it at home address
// ============================================================================

import { NextResponse } from "next/server";
import { importShipment, getAgencies } from "@/lib/micorreo";
import { shopifyAdminFetch } from "@/lib/shopify-admin";
import type { MiCorreoShipmentRequest } from "@/lib/micorreo-types";

// Province name → code mapping
const PROVINCE_CODE_MAP: Record<string, string> = {
  "buenos aires": "B",
  "capital federal": "C",
  "ciudad autonoma de buenos aires": "C",
  caba: "C",
  catamarca: "K",
  chaco: "H",
  chubut: "U",
  cordoba: "X",
  córdoba: "X",
  corrientes: "W",
  "entre rios": "E",
  formosa: "P",
  jujuy: "Y",
  "la pampa": "L",
  "la rioja": "F",
  mendoza: "M",
  misiones: "N",
  neuquen: "Q",
  neuquén: "Q",
  "rio negro": "R",
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

function estimateDimensions(weightGrams: number) {
  if (weightGrams <= 300) return { height: 5, width: 15, length: 20 };
  if (weightGrams <= 600) return { height: 8, width: 20, length: 25 };
  if (weightGrams <= 1200) return { height: 13, width: 22, length: 35 };
  if (weightGrams <= 2500) return { height: 26, width: 22, length: 35 };
  return { height: 30, width: 25, length: 38 };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    // 1. Fetch order from Shopify
    const gid = orderId.startsWith("gid://")
      ? orderId
      : `gid://shopify/Order/${orderId}`;

    const data = await shopifyAdminFetch<{
      node: {
        id: string;
        name: string;
        email: string;
        totalPriceSet: { shopMoney: { amount: string } };
        shippingAddress: {
          firstName: string;
          lastName: string;
          address1: string;
          address2: string | null;
          city: string;
          province: string;
          provinceCode: string;
          zip: string;
          phone: string | null;
        } | null;
        lineItems: {
          edges: { node: { title: string; quantity: number } }[];
        };
      } | null;
    }>(`query GetOrder($id: ID!) {
      node(id: $id) {
        ... on Order {
          id name email
          totalPriceSet { shopMoney { amount } }
          shippingAddress {
            firstName lastName address1 address2
            city province provinceCode zip phone
          }
          lineItems(first: 20) {
            edges { node { title quantity } }
          }
        }
      }
    }`, { id: gid });

    const order = data.node;
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.shippingAddress) {
      return NextResponse.json({ error: "Order has no shipping address" }, { status: 400 });
    }

    const custAddr = order.shippingAddress;

    // 2. Find nearest agency to customer for drop-off
    const provinceCode = custAddr.provinceCode || 
      PROVINCE_CODE_MAP[custAddr.province?.toLowerCase()] || "C";
    
    let nearestAgencyCode: string | null = null;
    try {
      const agencies = await getAgencies(provinceCode);
      if (agencies.length > 0) {
        // Find closest by postal code prefix
        const destZip = custAddr.zip.replace(/\D/g, "");
        let bestMatch = agencies[0];
        let bestLen = 0;
        for (const a of agencies) {
          if (a.status !== "ACTIVE") continue;
          const aZip = a.location?.address?.postalCode?.replace(/\D/g, "") || "";
          let matchLen = 0;
          for (let i = 0; i < Math.min(destZip.length, aZip.length); i++) {
            if (destZip[i] === aZip[i]) matchLen++;
            else break;
          }
          if (matchLen > bestLen) {
            bestLen = matchLen;
            bestMatch = a;
          }
        }
        nearestAgencyCode = bestMatch.code;
      }
    } catch (err) {
      console.warn("Failed to find agency for return:", err);
    }

    // 3. Build RETURN shipment: customer → store
    // Parse store address
    const storeStreet = process.env.SENDER_STREET || "";
    const storeNumber = process.env.SENDER_STREET_NUMBER || "";

    // Parse customer address
    const custAddrMatch = custAddr.address1.match(/^(.+?)\s+(\d+.*)$/);
    const custStreetName = custAddrMatch ? custAddrMatch[1] : custAddr.address1;
    const custStreetNumber = custAddrMatch ? custAddrMatch[2] : "S/N";

    // Estimate weight
    const totalItems = order.lineItems.edges.reduce((s, li) => s + li.node.quantity, 0);
    const estimatedWeight = Math.max(totalItems * 800, 500);
    const dims = estimateDimensions(estimatedWeight);

    const returnShipment: Omit<MiCorreoShipmentRequest, "customerId"> = {
      extOrderId: `DEV-${order.name.replace("#", "")}`,
      orderNumber: `DEV-${order.name}`,
      // SENDER = Customer (drops off at branch)
      sender: {
        name: `${custAddr.firstName} ${custAddr.lastName}`.trim(),
        phone: custAddr.phone || null,
        cellPhone: null,
        email: order.email || null,
        originAddress: {
          streetName: custStreetName,
          streetNumber: custStreetNumber,
          floor: null,
          apartment: custAddr.address2 || null,
          city: custAddr.city,
          provinceCode: custAddr.provinceCode,
          postalCode: custAddr.zip,
        },
      },
      // RECIPIENT = Store (receives at domicilio)
      recipient: {
        name: process.env.SENDER_NAME || "",
        phone: process.env.SENDER_PHONE || "",
        cellPhone: "",
        email: process.env.SENDER_EMAIL || "",
      },
      shipping: {
        // Customer drops off at sucursal
        deliveryType: "D", // Delivery to store address (domicilio)
        productType: "CP",
        agency: nearestAgencyCode, // Nearest branch for customer to drop off
        address: {
          // Destination = STORE address
          streetName: storeStreet,
          streetNumber: storeNumber,
          floor: "",
          apartment: "",
          city: process.env.SENDER_CITY || "",
          provinceCode: process.env.SENDER_STATE || "",
          postalCode: process.env.SENDER_ZIPCODE || "",
        },
        weight: estimatedWeight,
        declaredValue: Math.round(parseFloat(order.totalPriceSet.shopMoney.amount) * 100) / 100,
        height: dims.height,
        length: dims.length,
        width: dims.width,
      },
    };

    // 4. Import to MiCorreo
    const result = await importShipment(returnShipment);

    return NextResponse.json({
      success: true,
      orderName: order.name,
      returnOrderId: `DEV-${order.name.replace("#", "")}`,
      nearestAgency: nearestAgencyCode,
      createdAt: result.createdAt,
      message: `Etiqueta de devolución generada para ${order.name}`,
    });
  } catch (error) {
    console.error("Return shipment error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate return label", details: message },
      { status: 500 }
    );
  }
}
