// ============================================================================
// Clasificación de pedidos según la sucursal (ubicación de Shopify)
//
// Cada producto de un pedido sale de una ubicación de Shopify. Según la
// ubicación, el pedido se rotula en la lista de pendientes:
//
//   - Sin color (Depósito Martínez y propias) y VERDE (marketplace) salen
//     juntos desde nuestro depósito.
//   - AMARILLO: el proveedor tiene el stock y hay que esperar que llegue al
//     depósito. Si se mezcla con verde, todo el envío espera → AMARILLO.
//   - ROJO: el proveedor despacha directo, no pasa por nuestro depósito.
//     Si el pedido trae rojo y algo más, son dos etiquetas: "ROJO + ...".
//   - Ubicación que no figura en la lista → SIN CLASIFICAR (nunca se adivina).
//
// Para agregar o mover una sucursal, editar las listas de abajo. Si el nombre
// de la ubicación en Shopify trae el emoji 🟢 / 🟡 / 🔴, se usa el emoji.
//
// Esto es SOLO informativo: no cambia nada de lo que se envía a MiCorreo.
// ============================================================================

export type BranchColor = "PROPIA" | "VERDE" | "AMARILLO" | "ROJO";

const BRANCHES: Record<BranchColor, string[]> = {
  PROPIA: ["DEPOSITO MARTINEZ", "FERIA INDY", "INDY (Rawson)"],
  VERDE: [
    "COOPERCAL / USBRAND (Vision-Mormai-Airwalk-Amerika)",
    "LUXO",
    "ELEPANTS SRL (Elepants)",
    "FAMILYARG",
    "HINDISTRI S.R.L (SERVANT)",
    "ULLUA (Thrasher - Spitfire - DTS)",
  ],
  AMARILLO: [
    "BLOQUE DISTRIBUTION",
    "DISTRINANDO SA (Reebok - Kappa)",
    "GOTCHA",
    "ID (Converse - Le Coq Sportif)",
  ],
  ROJO: ["NTF", "ORCHARD", "ORNG", "VART"],
};

/** Mayúsculas, sin acentos, sin emoji ni puntuación, espacios simples. */
export function normalizeBranchName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

const LOOKUP = new Map<string, BranchColor>();
for (const [color, names] of Object.entries(BRANCHES) as [BranchColor, string[]][]) {
  for (const n of names) LOOKUP.set(normalizeBranchName(n), color);
}

/** Color de una ubicación, o null si no se reconoce. */
export function branchColor(locationName: string): BranchColor | null {
  if (locationName.includes("🔴")) return "ROJO";
  if (locationName.includes("🟡")) return "AMARILLO";
  if (locationName.includes("🟢")) return "VERDE";
  return LOOKUP.get(normalizeBranchName(locationName)) ?? null;
}

/**
 * Rótulo del pedido a partir de las ubicaciones de sus productos.
 * Devuelve null si no hay ubicaciones (no se muestra nada).
 */
export function orderBranchLabel(locationNames: string[]): string | null {
  const names = locationNames.filter((n) => n && n.trim());
  if (names.length === 0) return null;

  const colors = names.map(branchColor);
  if (colors.some((c) => c === null)) return "SIN CLASIFICAR";

  const hasRed = colors.includes("ROJO");
  const own = colors.filter((c) => c !== "ROJO");

  let ownLabel: string | null = null;
  if (own.includes("AMARILLO")) ownLabel = "AMARILLO";
  else if (own.length > 0) ownLabel = "VERDE"; // verde y/o propia: sale ya

  if (hasRed && ownLabel) return `ROJO + ${ownLabel}`;
  if (hasRed) return "ROJO";
  return ownLabel;
}
