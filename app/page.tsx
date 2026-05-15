"use client";

import { useState, useEffect, useCallback } from "react";

type ReturnResult = {
  success?: boolean;
  orderName?: string;
  returnOrderId?: string;
  nearestAgency?: string;
  createdAt?: string;
  message?: string;
  error?: string;
  details?: string;
};

type SyncResult = {
  totalOrders?: number;
  correoArgentinaOrders?: number;
  results?: { orderName: string; status: string; reason?: string }[];
  error?: string;
  details?: string;
};

type PendingOrder = {
  id: string;
  numericId: string;
  name: string;
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
};

type PendingResult = {
  total: number;
  synced: number;
  notSynced: number;
  orders: PendingOrder[];
  error?: string;
};

export default function Dashboard() {
  const [orderInput, setOrderInput] = useState("");
  const [returnStatus, setReturnStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [returnResult, setReturnResult] = useState<ReturnResult | null>(null);

  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "done">("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const [forceSyncInput, setForceSyncInput] = useState("");
  const [forceSyncStatus, setForceSyncStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [forceSyncResult, setForceSyncResult] = useState<SyncResult | null>(null);

  // Pending orders
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Extract numeric order ID from various formats
  function parseOrderId(input: string): string {
    const cleaned = input.trim().replace("#", "");
    if (/^\d+$/.test(cleaned)) return cleaned;
    if (cleaned.startsWith("gid://")) return cleaned;
    return cleaned;
  }

  // Fetch pending orders
  const loadPendingOrders = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch("/api/shipping/pending-orders?daysBack=7");
      const data: PendingResult = await res.json();
      if (data.orders) {
        setPendingOrders(data.orders);
        // Do not auto-select orders anymore, start with empty selection
        setSelectedIds(new Set());
      }
    } catch {
      // silently fail
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPendingOrders();
  }, [loadPendingOrders]);

  function toggleOrder(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const unsynced = pendingOrders.filter((o) => !o.synced);
    if (selectedIds.size === unsynced.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unsynced.map((o) => o.id)));
    }
  }

  async function handleReturn() {
    if (!orderInput.trim()) return;
    setReturnStatus("loading");
    setReturnResult(null);

    try {
      const res = await fetch("/api/shipping/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: parseOrderId(orderInput) }),
      });
      const data = await res.json();
      setReturnResult(data);
      setReturnStatus(data.success ? "success" : "error");
    } catch {
      setReturnResult({ error: "Error de conexión" });
      setReturnStatus("error");
    }
  }

  async function handleForceSync() {
    if (!forceSyncInput.trim()) return;
    setForceSyncStatus("loading");
    setForceSyncResult(null);

    const cleaned = forceSyncInput.trim().replace("#", "");
    
    try {
      const res = await fetch("/api/shipping/sync-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exactOrderName: cleaned, force: true }),
      });
      const data = await res.json();
      setForceSyncResult(data);
      setForceSyncStatus(data.error ? "error" : "success");
      await loadPendingOrders();
    } catch {
      setForceSyncResult({ error: "Error de conexión" });
      setForceSyncStatus("error");
    }
  }

  async function handleSyncSelected() {
    if (selectedIds.size === 0) return;
    setSyncStatus("loading");
    setSyncResult(null);

    try {
      const res = await fetch("/api/shipping/sync-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daysBack: 7,
          force: true,
          orderIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      setSyncResult(data);
      setSyncStatus("done");
      // Refresh the list
      await loadPendingOrders();
    } catch {
      setSyncResult({ error: "Error de conexión" });
      setSyncStatus("done");
    }
  }

  async function handleSyncAll(force = false) {
    setSyncStatus("loading");
    setSyncResult(null);

    try {
      const res = await fetch("/api/shipping/sync-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 1, force }),
      });
      const data = await res.json();
      setSyncResult(data);
      setSyncStatus("done");
      await loadPendingOrders();
    } catch {
      setSyncResult({ error: "Error de conexión" });
      setSyncStatus("done");
    }
  }

  const unsyncedOrders = pendingOrders;

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatPrice(amount: string) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(parseFloat(amount));
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logoBox}>📦</div>
          <div>
            <h1 style={styles.title}>Correo Argentino</h1>
            <p style={styles.subtitle}>Panel de gestión de envíos — Indy</p>
          </div>
        </header>

        {/* Pending Orders Section */}
        <section style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={styles.cardTitle}>📋 Órdenes no preparadas</h2>
            <button
              onClick={loadPendingOrders}
              disabled={pendingLoading}
              style={{
                ...styles.btnSmall,
                marginTop: 0,
                opacity: pendingLoading ? 0.6 : 1,
              }}
            >
              {pendingLoading ? "Cargando..." : "🔄 Actualizar"}
            </button>
          </div>

          {pendingLoading && pendingOrders.length === 0 && (
            <p style={{ color: "#888", fontSize: "13px" }}>Cargando órdenes...</p>
          )}

          {/* Stats */}
          {pendingOrders.length > 0 && (
            <div style={styles.statsRow}>
              <span style={styles.statBadge}>
                {pendingOrders.length} órdenes pendientes de sincronización
              </span>
            </div>
          )}

          {/* Unsynced Orders List */}
          {unsyncedOrders.length > 0 && (
            <>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                margin: "16px 0 8px",
                position: "sticky",
                top: "16px",
                backgroundColor: "#1a1a1a",
                padding: "12px 16px",
                zIndex: 10,
                borderRadius: "8px",
                border: "1px solid #333",
                boxShadow: "0 8px 16px rgba(0,0,0,0.5)"
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "#aaa" }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === unsyncedOrders.length}
                    onChange={toggleAll}
                    style={styles.checkbox}
                  />
                  Seleccionar todas ({unsyncedOrders.length})
                </label>
                <button
                  onClick={handleSyncSelected}
                  disabled={syncStatus === "loading" || selectedIds.size === 0}
                  style={{
                    ...styles.btnPrimary,
                    opacity: syncStatus === "loading" || selectedIds.size === 0 ? 0.5 : 1,
                    fontSize: "13px",
                    padding: "8px 16px",
                  }}
                >
                  {syncStatus === "loading"
                    ? "Sincronizando..."
                    : `Sincronizar ${selectedIds.size} seleccionada${selectedIds.size !== 1 ? "s" : ""}`}
                </button>
              </div>

              <div style={styles.orderList}>
                {unsyncedOrders.map((order) => (
                  <label
                    key={order.id}
                    style={{
                      ...styles.orderRow,
                      backgroundColor: selectedIds.has(order.id) ? "#1a2a1a" : "#111",
                      borderColor: selectedIds.has(order.id) ? "#3a5a2a" : "#2a2a2a",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(order.id)}
                      onChange={() => toggleOrder(order.id)}
                      style={styles.checkbox}
                    />
                    <div style={styles.orderInfo}>
                      <div style={styles.orderHeader}>
                        <span style={styles.orderName}>{order.name}</span>
                        <span style={styles.orderPrice}>{formatPrice(order.totalPrice)}</span>
                      </div>
                      <div style={styles.orderMeta}>
                        <span>{order.customerName}</span>
                        <span>•</span>
                        <span>{order.city}{order.province ? `, ${order.province}` : ""}</span>
                        <span>•</span>
                        <span>{order.itemCount} art.</span>
                        <span>•</span>
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                      <div style={styles.orderShipping}>{order.shippingMethod}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}



          {pendingOrders.length === 0 && !pendingLoading && (
            <p style={{ color: "#888", fontSize: "13px" }}>No hay órdenes no preparadas con Correo Argentino</p>
          )}

          {/* Sync Results */}
          {syncStatus === "done" && syncResult && !syncResult.error && (
            <div style={styles.syncResults}>
              {syncResult.results?.map((r, i) => (
                <div key={i} style={styles.syncRow}>
                  <span style={{
                    ...styles.syncBadge,
                    backgroundColor: r.status === "imported" ? "#d4edda" : r.status === "skipped" ? "#e2e3e5" : "#f8d7da",
                    color: r.status === "imported" ? "#155724" : r.status === "skipped" ? "#383d41" : "#721c24",
                  }}>
                    {r.status === "imported" ? "✅" : r.status === "skipped" ? "⏭️" : "❌"} {r.orderName}
                  </span>
                  <span style={styles.syncReason}>{r.reason}</span>
                </div>
              ))}
            </div>
          )}

          {syncStatus === "done" && syncResult?.error && (
            <div style={styles.errorBox}>
              <strong>❌ Error</strong>
              <p>{syncResult.details || syncResult.error}</p>
            </div>
          )}
        </section>

        {/* Return Label Section */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>🔄 Generar etiqueta de devolución</h2>
          <p style={styles.cardDesc}>
            Ingresá el ID numérico de la orden de Shopify (ej: 7535024079091).
            Se invierte el envío: el cliente despacha en sucursal → vos recibís a domicilio.
          </p>

          <div style={styles.inputRow}>
            <input
              type="text"
              placeholder="ID de orden (ej: 7535024079091)"
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReturn()}
              style={styles.input}
            />
            <button
              onClick={handleReturn}
              disabled={returnStatus === "loading" || !orderInput.trim()}
              style={{
                ...styles.btnPrimary,
                opacity: returnStatus === "loading" || !orderInput.trim() ? 0.6 : 1,
              }}
            >
              {returnStatus === "loading" ? "Generando..." : "Generar devolución"}
            </button>
          </div>

          {returnStatus === "success" && returnResult?.success && (
            <div style={styles.successBox}>
              <strong>✅ Etiqueta generada</strong>
              <div style={styles.resultGrid}>
                <span>Orden:</span><span>{returnResult.orderName}</span>
                <span>ID devolución:</span><span>{returnResult.returnOrderId}</span>
                <span>Sucursal:</span><span>{returnResult.nearestAgency || "Auto"}</span>
                <span>Fecha:</span><span>{returnResult.createdAt}</span>
              </div>
              <p style={styles.hint}>Aparecerá en MiCorreo → Pendientes</p>
            </div>
          )}

          {returnStatus === "error" && (
            <div style={styles.errorBox}>
              <strong>❌ Error</strong>
              <p>{returnResult?.details || returnResult?.error}</p>
              <button onClick={() => setReturnStatus("idle")} style={styles.btnSmall}>
                Reintentar
              </button>
            </div>
          )}
        </section>

        {/* Force Sync Section */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>🚀 Forzar sincronización de orden</h2>
          <p style={styles.cardDesc}>
            Ingresá el número de la orden de Shopify (ej: 202114) para forzar su importación manualmente (útil para órdenes viejas o con errores).
          </p>

          <div style={styles.inputRow}>
            <input
              type="text"
              placeholder="Número de orden (ej: 202114)"
              value={forceSyncInput}
              onChange={(e) => setForceSyncInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleForceSync()}
              style={styles.input}
            />
            <button
              onClick={handleForceSync}
              disabled={forceSyncStatus === "loading" || !forceSyncInput.trim()}
              style={{
                ...styles.btnPrimary,
                backgroundColor: "#2e2e2e",
                color: "#e0e0e0",
                opacity: forceSyncStatus === "loading" || !forceSyncInput.trim() ? 0.6 : 1,
              }}
            >
              {forceSyncStatus === "loading" ? "Procesando..." : "Forzar importación"}
            </button>
          </div>

          {forceSyncStatus === "success" && forceSyncResult && !forceSyncResult.error && (
            <div style={styles.syncResults}>
              {forceSyncResult.results?.map((r, i) => (
                <div key={i} style={styles.syncRow}>
                  <span style={{
                    ...styles.syncBadge,
                    backgroundColor: r.status === "imported" ? "#d4edda" : r.status === "skipped" ? "#e2e3e5" : "#f8d7da",
                    color: r.status === "imported" ? "#155724" : r.status === "skipped" ? "#383d41" : "#721c24",
                  }}>
                    {r.status === "imported" ? "✅" : r.status === "skipped" ? "⏭️" : "❌"} {r.orderName}
                  </span>
                  <span style={styles.syncReason}>{r.reason}</span>
                </div>
              ))}
            </div>
          )}

          {forceSyncStatus === "error" && (
            <div style={styles.errorBox}>
              <strong>❌ Error</strong>
              <p>{forceSyncResult?.details || forceSyncResult?.error}</p>
            </div>
          )}
        </section>

        {/* Quick Links */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>🔗 Links rápidos</h2>
          <div style={styles.linkGrid}>
            <a href="https://www.correoargentino.com.ar/MiCorreo/mainPending" target="_blank" rel="noreferrer" style={styles.link}>
              📋 MiCorreo — Pendientes
            </a>
            <a href="https://www.correoargentino.com.ar/MiCorreo/mainPaid" target="_blank" rel="noreferrer" style={styles.link}>
              🏷️ MiCorreo — Pagados / Rótulos
            </a>
            <a href="https://admin.shopify.com/store/indy-com-ar/orders" target="_blank" rel="noreferrer" style={styles.link}>
              🛒 Shopify — Pedidos
            </a>
          </div>
        </section>

        <footer style={styles.footer}>
          Correo Argentino Integration v1.1 — Indy
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#0f0f0f",
    color: "#e0e0e0",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    padding: "20px",
  },
  container: {
    maxWidth: "780px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    marginBottom: "32px",
    padding: "24px 0",
  },
  logoBox: {
    width: "52px",
    height: "52px",
    backgroundColor: "#ffd700",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "26px",
    flexShrink: 0,
  },
  title: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#fff",
    margin: 0,
  },
  subtitle: {
    fontSize: "13px",
    color: "#888",
    margin: "2px 0 0",
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: "12px",
    border: "1px solid #2a2a2a",
    padding: "24px",
    marginBottom: "16px",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#fff",
    margin: 0,
  },
  cardDesc: {
    fontSize: "13px",
    color: "#888",
    margin: "0 0 16px",
    lineHeight: "1.5",
  },
  inputRow: {
    display: "flex",
    gap: "10px",
  },
  input: {
    flex: 1,
    backgroundColor: "#111",
    border: "1px solid #333",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
  },
  btnPrimary: {
    backgroundColor: "#ffd700",
    color: "#1a1a1a",
    border: "none",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  btnSmall: {
    backgroundColor: "#333",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "6px 14px",
    fontSize: "12px",
    cursor: "pointer",
    marginTop: "8px",
  },
  successBox: {
    backgroundColor: "#0d2818",
    border: "1px solid #1a5c2e",
    borderRadius: "8px",
    padding: "16px",
    marginTop: "16px",
    fontSize: "13px",
    color: "#8fd19e",
  },
  errorBox: {
    backgroundColor: "#2d1215",
    border: "1px solid #5c1a1a",
    borderRadius: "8px",
    padding: "16px",
    marginTop: "16px",
    fontSize: "13px",
    color: "#f8a0a0",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "4px 12px",
    marginTop: "8px",
    fontSize: "13px",
  },
  hint: {
    margin: "12px 0 0",
    fontSize: "11px",
    color: "#6a9",
    fontStyle: "italic",
  },
  statsRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap" as const,
    marginTop: "8px",
  },
  statBadge: {
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    backgroundColor: "#222",
    color: "#aaa",
  },
  orderList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  orderRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #2a2a2a",
    backgroundColor: "#111",
    cursor: "pointer",
    transition: "background-color 0.15s",
  },
  orderInfo: {
    flex: 1,
    minWidth: 0,
  },
  orderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },
  orderName: {
    fontWeight: 600,
    fontSize: "14px",
    color: "#fff",
  },
  orderPrice: {
    fontSize: "13px",
    color: "#ffd700",
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  },
  orderMeta: {
    display: "flex",
    gap: "6px",
    fontSize: "12px",
    color: "#888",
    marginTop: "2px",
    flexWrap: "wrap" as const,
  },
  orderShipping: {
    fontSize: "11px",
    color: "#6a9",
    marginTop: "4px",
  },
  checkbox: {
    width: "16px",
    height: "16px",
    marginTop: "2px",
    accentColor: "#ffd700",
    cursor: "pointer",
    flexShrink: 0,
  },
  syncResults: {
    marginTop: "16px",
  },
  syncRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "6px 0",
    borderBottom: "1px solid #222",
    fontSize: "13px",
  },
  syncBadge: {
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  },
  syncReason: {
    fontSize: "12px",
    color: "#888",
  },
  linkGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
    marginTop: "12px",
  },
  link: {
    color: "#ffd700",
    textDecoration: "none",
    fontSize: "14px",
    padding: "8px 0",
    borderBottom: "1px solid #222",
  },
  footer: {
    textAlign: "center" as const,
    fontSize: "11px",
    color: "#555",
    padding: "24px 0",
  },
};
