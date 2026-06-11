// ============================================================================
// POST /api/shipping/sync-orders
// Manually sync today's Correo Argentino orders into MiCorreo
// Used to catch up on orders that the webhook missed
// ============================================================================

import { NextResponse } from "next/server";
import { importShipment, buildShipmentRequest } from "@/lib/micorreo";
import { shopifyAdminFetch, addOrderMetafield, updateOrderNote } from "@/lib/shopify-admin";

interface SyncResult {
  orderName: string;
  status: "imported" | "skipped" | "error";
  reason?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack || 1;
    const forceReimport = body.force === true;
    const selectedOrderIds: string[] | undefined = body.orderIds;
    const exactOrderNameInput: string | undefined = body.exactOrderName;
    let exactOrderName = exactOrderNameInput;
    let orderSuffix = "";
    if (exactOrderNameInput && exactOrderNameInput.includes("-")) {
      const parts = exactOrderNameInput.split("-");
      orderSuffix = "-" + parts.slice(1).join("-");
      exactOrderName = parts[0];
    }

    // 1. Calculate date range
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceISO = sinceDate.toISOString();

    console.log(`ðŸ”„ Syncing orders since ${sinceISO}...`);

    // 2. Fetch recent UNFULFILLED + PAID orders from Shopify via GraphQL
    // If exactOrderName is provided, query specifically for that order bypassing dates
    const shopifyQuery = exactOrderName 
      ? `name:${exactOrderName}`
      : `financial_status:paid fulfillment_status:unfulfilled created_at:>='${sinceISO}'`;

    const query = `{
      orders(first: 50, query: "${shopifyQuery}", sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            email
            createdAt
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount } }
            note
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              provinceCode
              zip
              phone
            }
            shippingLines(first: 3) {
              edges {
                node { title code }
              }
            }
            lineItems(first: 50) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet { shopMoney { amount } }
                }
              }
            }
            metafields(first: 10, keys: ["correo_argentino.shipment_id", "correo_argentino.imported_at"]) {
              edges {
                node { namespace key value }
              }
            }
          }
        }
      }
    }`;

    type OrderEdge = {
      node: {
        id: string;
        name: string;
        email: string;
        createdAt: string;
        displayFulfillmentStatus: string;
        totalPriceSet: { shopMoney: { amount: string } };
        note: string | null;
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
        shippingLines: { edges: { node: { title: string; code: string | null } }[] };
        lineItems: {
          edges: {
            node: {
              title: string;
              quantity: number;
              originalUnitPriceSet: { shopMoney: { amount: string } };
            };
          }[];
        };
        metafields: { edges: { node: { namespace: string; key: string; value: string } }[] };
      };
    };

    const data = await shopifyAdminFetch<{ orders: { edges: OrderEdge[] } }>(query);
    const allOrders = data.orders.edges.map((e) => e.node);

    console.log(`Found ${allOrders.length} unfulfilled+paid orders since ${sinceISO}`);

    // 3. Filter to Correo Argentino orders only
    const caOrders = allOrders.filter((order) =>
      order.shippingLines.edges.some(
        (sl) =>
          sl.node.title.toLowerCase().includes("correo") ||
          (sl.node.code || "").toLowerCase().includes("correo")
      )
    );

    console.log(`${caOrders.length} use Correo Argentino shipping`);

    // 3b. If specific order IDs were requested, filter further
    const ordersToSync = selectedOrderIds?.length
      ? caOrders.filter((order) => selectedOrderIds.includes(order.id))
      : caOrders;

    console.log(`${ordersToSync.length} orders to process`);

    // 4. Import each one that hasn't been imported yet
    const results: SyncResult[] = [];

    for (const order of ordersToSync) {
      // Skip ON_HOLD orders
      const fulfillmentStatus = order.displayFulfillmentStatus || "";
      if (fulfillmentStatus === "ON_HOLD") {
        results.push({ orderName: order.name, status: "skipped", reason: "Order is ON_HOLD" });
        continue;
      }

      // Check if already imported via metafield (skip if force=true)
      const financialStatus = (order as any).displayFinancialStatus || "";
      if (exactOrderNameInput && (financialStatus === "PENDING" || financialStatus === "PARTIALLY_PAID")) {
        results.push({ orderName: order.name, status: "error", reason: "Pedido pendiente de pago" });
        continue;
      }

      const alreadyImported = order.metafields.edges.some(
        (mf) => mf.node.namespace === "correo_argentino" && mf.node.key === "imported_at"
      );

      // Also check note for import marker
      const noteImported = order.note?.includes("Correo Argentino - EnvÃ­o importado");

      if (!forceReimport && (alreadyImported || noteImported)) {
        results.push({
          orderName: order.name,
          status: "skipped",
          reason: "Already imported",
        });
        continue;
      }

      if (!order.shippingAddress) {
        results.push({
          orderName: order.name,
          status: "skipped",
          reason: "No shipping address",
        });
        continue;
      }

      try {
        // Determine delivery type and agency from shipping line
        const shippingLine = order.shippingLines.edges[0]?.node;
        const shippingTitle = shippingLine?.title?.toLowerCase() || "";
        const shippingCode = shippingLine?.code || "";

        const deliveryType: "D" | "S" = shippingTitle.includes("suc.") ? "S" : "D";

        let agencyCode: string | undefined;
        if (deliveryType === "S") {
          const codeMatch = shippingCode.match(
            /correo-argentino-sucursal-(?:clásico-|clasico-)?(.+)/i
          );
          agencyCode = codeMatch?.[1];
        }

        // Estimate weight from item count (fallback since we don't have grams in GraphQL easily)
        const totalItems = order.lineItems.edges.reduce(
          (sum, li) => sum + li.node.quantity,
          0
        );
        const estimatedWeight = Math.max(totalItems * 400, 200); // ~400g per item (conservative avg)

        const addr = order.shippingAddress;
        const nameWithPhone = addr.phone ? `${addr.firstName} ${addr.lastName} CEL ${addr.phone}`.trim() : `${addr.firstName} ${addr.lastName}`.trim();
        const shipmentData = buildShipmentRequest({
          orderName: order.name + orderSuffix,
          orderId: order.id.split("/").pop() || "",
          recipient: {
            name: nameWithPhone,
            email: order.email,
            phone: addr.phone || "",
            address1: addr.address1,
            address2: addr.address2 || undefined,
            city: addr.city,
            provinceCode: addr.provinceCode,
            zip: addr.zip,
          },
          weightGrams: estimatedWeight,
          declaredValue: parseFloat(order.totalPriceSet.shopMoney.amount),
          deliveryType,
          agencyCode,
          itemCount: totalItems,
        });

        const result = await importShipment(shipmentData);

        // Mark as imported in Shopify
        const numericId = order.id.split("/").pop() || "";
        try {
          await addOrderMetafield(numericId, "correo_argentino", "imported_at", result.createdAt);
          const notePrefix = order.note ? `${order.note}\n` : "";
          await updateOrderNote(
            numericId,
            `${notePrefix}ðŸ“¦ Correo Argentino - EnvÃ­o importado (${result.createdAt})`
          );
        } catch {
          // Non-critical
        }

        results.push({
          orderName: order.name,
          status: "imported",
          reason: `Imported at ${result.createdAt}`,
        });

        console.log(`âœ… Imported ${order.name}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        results.push({
          orderName: order.name,
          status: "error",
          reason: msg,
        });
        console.error(`âŒ Failed to import ${order.name}: ${msg}`);
      }
    }

    return NextResponse.json({
      totalOrders: allOrders.length,
      correoArgentinaOrders: caOrders.length,
      results,
    });
  } catch (error) {
    console.error("Sync orders error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Sync failed", details: message }, { status: 500 });
  }
}


