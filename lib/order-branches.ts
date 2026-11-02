// ============================================================================
// Sucursales (ubicaciones de Shopify) de cada pedido → rótulo de color
// ============================================================================

import { shopifyAdminFetch } from "@/lib/shopify-admin";
import { orderBranchLabel } from "@/lib/branch-status";

export interface OrderBranchInfo {
  names: string[];
  label: string | null;
}

/** Acepta "gid://shopify/Order/123" o "123". */
function toOrderGid(id: string | number): string {
  const s = String(id);
  return s.startsWith("gid://") ? s : `gid://shopify/Order/${s}`;
}

/**
 * Busca las ubicaciones de cada pedido y calcula su rótulo
 * (VERDE / AMARILLO / ROJO / ...). Nunca lanza error: si la consulta falla
 * (por ejemplo, falta el permiso read_merchant_managed_fulfillment_orders)
 * devuelve un mapa vacío y quien llama sigue como si no hubiera rótulo.
 * Las claves del mapa son los GID de los pedidos.
 */
export async function fetchOrderBranches(
  orderIds: (string | number)[]
): Promise<Map<string, OrderBranchInfo>> {
  const result = new Map<string, OrderBranchInfo>();
  const ids = orderIds.map(toOrderGid);
  if (ids.length === 0) return result;

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

    // Shopify acepta hasta 250 ids por consulta nodes; partimos por las dudas.
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const data = await shopifyAdminFetch<{ nodes: Node[] }>(query, { ids: chunk });
      for (const node of data.nodes) {
        if (!node?.id || !node.fulfillmentOrders) continue;
        const names = node.fulfillmentOrders.edges
          .map((e) => e.node)
          .filter((fo) => fo.status !== "CANCELLED" && fo.status !== "CLOSED")
          .map((fo) => fo.assignedLocation?.name || "")
          .filter(Boolean);
        result.set(node.id, { names, label: orderBranchLabel(names) });
      }
    }
  } catch (err) {
    console.warn("[Branches] No se pudieron leer las sucursales de los pedidos:", err);
  }
  return result;
}

/** Rótulo de un solo pedido, o null si no se pudo determinar. */
export async function fetchOrderBranchLabel(orderId: string | number): Promise<string | null> {
  const map = await fetchOrderBranches([orderId]);
  return map.get(toOrderGid(orderId))?.label ?? null;
}
