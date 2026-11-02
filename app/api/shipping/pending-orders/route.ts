// ============================================================================
// GET /api/shipping/pending-orders
// Lists unfulfilled Correo Argentino orders with their sync status
// ============================================================================

import { NextResponse } from "next/server";
import { shopifyAdminFetch } from "@/lib/shopify-admin";
import { orderBranchLabel } from "@/lib/branch-status";

/**
 * Busca las ubicaciones (sucursales) de cada pedido. Va en una consulta
 * separada a propósito: si falla (por ejemplo, falta el permiso
 * read_merchant_managed_fulfillment_orders), la lista de pendientes se sigue
 * mostrando igual, solo que sin rótulo.
 */
async function fetchOrderLocations(orderIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (orderIds.length === 0) return result;

  try {
    const query = `query ($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Order {
          id
          fulfillmentOrders(first: 20) {
            edges { node { status assignedLocation { name } } }
          }
        }
      }
    }`;
    type Node = {
      id?: string;
      fulfillmentOrders?: {
        edges: { node: { status: string; assignedLocation: { name: string | null } | null } }[];
      };
    } | null;

    const data = await shopifyAdminFetch<{ nodes: Node[] }>(query, { ids: orderIds });
    for (const node of data.nodes) {
      if (!node?.id || !node.fulfillmentOrders) continue;
      const names = node.fulfillmentOrders.edges
        .map((e) => e.node)
        .filter((fo) => fo.status !== "CANCELLED" && fo.status !== "CLOSED")
        .map((fo) => fo.assignedLocation?.name || "")
        .filter(Boolean);
      result.set(node.id, names);
    }
  } catch (err) {
    console.warn("[Pending] No se pudieron leer las sucursales de los pedidos:", err);
  }
  return result;
}

export interface PendingOrder {
  id: string;        // Shopify GID
  numericId: string;  // numeric ID
  name: string;       // e.g. "#202420"
  email: string;
  createdAt: string;
  totalPrice: string;
  customerName: string;
  city: string;
  province: string;
  shippingMethod: string;
  itemCount: number;
  synced: boolean;
  syncedAt?: string;
  /** VERDE / AMARILLO / ROJO / "ROJO + VERDE" / SIN CLASIFICAR (solo informativo) */
  branchLabel?: string | null;
  branchNames?: string[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get("daysBack") || "3");

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const sinceISO = sinceDate.toISOString();

    const query = `{
      orders(first: 50, query: "financial_status:paid fulfillment_status:unfulfilled created_at:>='${sinceISO}'", sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            email
            createdAt
            totalPriceSet { shopMoney { amount } }
            note
            shippingAddress {
              firstName
              lastName
              city
              province
            }
            shippingLines(first: 3) {
              edges {
                node { title code }
              }
            }
            lineItems(first: 50) {
              edges {
                node { quantity }
              }
            }
            metafields(first: 10, keys: ["correo_argentino.imported_at"]) {
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
        totalPriceSet: { shopMoney: { amount: string } };
        note: string | null;
        shippingAddress: {
          firstName: string;
          lastName: string;
          city: string;
          province: string;
        } | null;
        shippingLines: { edges: { node: { title: string; code: string | null } }[] };
        lineItems: { edges: { node: { quantity: number } }[] };
        metafields: { edges: { node: { namespace: string; key: string; value: string } }[] };
      };
    };

    const data = await shopifyAdminFetch<{ orders: { edges: OrderEdge[] } }>(query);
    const allOrders = data.orders.edges.map((e) => e.node);

    // Filter to Correo Argentino orders
    const caOrders = allOrders.filter((order) =>
      order.shippingLines.edges.some(
        (sl) =>
          sl.node.title.toLowerCase().includes("correo") ||
          (sl.node.code || "").toLowerCase().includes("correo")
      )
    );

    const pendingOrders: PendingOrder[] = caOrders.map((order) => {
      const importedMeta = order.metafields.edges.find(
        (mf) => mf.node.namespace === "correo_argentino" && mf.node.key === "imported_at"
      );
      const noteImported = order.note?.includes("Correo Argentino - Envío importado");
      const synced = !!(importedMeta || noteImported);

      const addr = order.shippingAddress;
      const shippingLine = order.shippingLines.edges[0]?.node;

      return {
        id: order.id,
        numericId: order.id.split("/").pop() || "",
        name: order.name,
        email: order.email,
        createdAt: order.createdAt,
        totalPrice: order.totalPriceSet.shopMoney.amount,
        customerName: addr
          ? `${addr.firstName} ${addr.lastName}`.trim()
          : "Sin dirección",
        city: addr?.city || "",
        province: addr?.province || "",
        shippingMethod: shippingLine?.title || "Correo Argentino",
        itemCount: order.lineItems.edges.reduce(
          (sum, li) => sum + li.node.quantity,
          0
        ),
        synced,
        syncedAt: importedMeta?.node.value,
      };
    });

    const unsyncedOnly = pendingOrders.filter(o => !o.synced);

    const locations = await fetchOrderLocations(unsyncedOnly.map((o) => o.id));
    for (const o of unsyncedOnly) {
      const names = locations.get(o.id);
      if (!names) continue;
      o.branchNames = names;
      o.branchLabel = orderBranchLabel(names);
    }

    return NextResponse.json({
      total: unsyncedOnly.length,
      synced: 0,
      notSynced: unsyncedOnly.length,
      orders: unsyncedOnly,
    });
  } catch (error) {
    console.error("Pending orders error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to fetch orders", details: message }, { status: 500 });
  }
}
