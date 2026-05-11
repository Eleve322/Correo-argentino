"use client";

import { useState } from "react";

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

export default function Dashboard() {
  const [orderInput, setOrderInput] = useState("");
  const [returnStatus, setReturnStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [returnResult, setReturnResult] = useState<ReturnResult | null>(null);

  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "done">("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Extract numeric order ID from various formats
  function parseOrderId(input: string): string {
    const cleaned = input.trim().replace("#", "");
    // If it's just a number, return as-is
    if (/^\d+$/.test(cleaned)) return cleaned;
    // If it's a Shopify GID
    if (cleaned.startsWith("gid://")) return cleaned;
    return cleaned;
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

  async function handleSync(force = false) {
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
    } catch {
      setSyncResult({ error: "Error de conexión" });
      setSyncStatus("done");
    }
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

        {/* Sync Section */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>📦 Sincronizar pedidos no preparados</h2>
          <p style={styles.cardDesc}>
            Importa a MiCorreo los pedidos de hoy con Correo Argentino que estén en estado
            &quot;No preparado&quot; y no se hayan sincronizado aún.
          </p>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => handleSync(false)}
              disabled={syncStatus === "loading"}
              style={{
                ...styles.btnSecondary,
                opacity: syncStatus === "loading" ? 0.6 : 1,
              }}
            >
              {syncStatus === "loading" ? "Sincronizando..." : "Sincronizar no preparados"}
            </button>
            <button
              onClick={() => handleSync(true)}
              disabled={syncStatus === "loading"}
              style={{
                ...styles.btnSmall,
                opacity: syncStatus === "loading" ? 0.6 : 1,
                marginTop: 0,
                padding: "10px 16px",
                fontSize: "13px",
                backgroundColor: "#3a2a00",
                color: "#ffd700",
                border: "1px solid #5a4a10",
              }}
            >
              🔁 Forzar re-sync
            </button>
          </div>

          {syncStatus === "done" && syncResult && !syncResult.error && (
            <div style={styles.syncResults}>
              <p style={styles.syncSummary}>
                {syncResult.totalOrders} no preparados · {syncResult.correoArgentinaOrders} con Correo Argentino
              </p>
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
          Correo Argentino Integration v1.0 — Indy
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
    maxWidth: "720px",
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
    margin: "0 0 8px",
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
    whiteSpace: "nowrap",
  },
  btnSecondary: {
    backgroundColor: "#2a2a2a",
    color: "#e0e0e0",
    border: "1px solid #444",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
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
  syncResults: {
    marginTop: "16px",
  },
  syncSummary: {
    fontSize: "13px",
    color: "#aaa",
    margin: "0 0 10px",
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
    whiteSpace: "nowrap",
  },
  syncReason: {
    fontSize: "12px",
    color: "#888",
  },
  linkGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  link: {
    color: "#ffd700",
    textDecoration: "none",
    fontSize: "14px",
    padding: "8px 0",
    borderBottom: "1px solid #222",
  },
  footer: {
    textAlign: "center",
    fontSize: "11px",
    color: "#555",
    padding: "24px 0",
  },
};
