"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ReturnPageContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id") || "";
  const orderName = searchParams.get("name") || "";
  const shop = searchParams.get("shop") || "";

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleGenerate = async () => {
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/shipping/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || "Error desconocido");
      }

      setResult(data);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
      setStatus("error");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#fafafa",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: "20px",
    }}>
      <div style={{
        backgroundColor: "white",
        borderRadius: "12px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        padding: "40px",
        maxWidth: "480px",
        width: "100%",
        textAlign: "center",
      }}>
        {/* Logo / Header */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{
            width: "56px",
            height: "56px",
            backgroundColor: "#ffd700",
            borderRadius: "12px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
            marginBottom: "16px",
          }}>
            📦
          </div>
          <h1 style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "#1a1a1a",
            margin: "0 0 4px",
          }}>
            Etiqueta de Devolución
          </h1>
          <p style={{
            fontSize: "14px",
            color: "#666",
            margin: 0,
          }}>
            Correo Argentino — {orderName || `Orden ${orderId}`}
          </p>
        </div>

        {/* Info box */}
        <div style={{
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "24px",
          textAlign: "left",
          fontSize: "13px",
          color: "#555",
          lineHeight: "1.6",
        }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#333" }}>
            ¿Qué hace esto?
          </p>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            <li>El cliente despacha en la sucursal más cercana</li>
            <li>El paquete llega a tu dirección (domicilio)</li>
            <li>Se genera un envío inverso en MiCorreo</li>
          </ul>
        </div>

        {/* Action */}
        {status === "idle" && (
          <button
            onClick={handleGenerate}
            style={{
              backgroundColor: "#ffd700",
              color: "#1a1a1a",
              border: "none",
              borderRadius: "8px",
              padding: "14px 28px",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#ffcc00")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#ffd700")}
          >
            Generar etiqueta de devolución
          </button>
        )}

        {status === "loading" && (
          <div style={{ padding: "20px", color: "#666" }}>
            <div style={{
              width: "32px",
              height: "32px",
              border: "3px solid #eee",
              borderTopColor: "#ffd700",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }} />
            <p style={{ margin: 0, fontSize: "14px" }}>Generando etiqueta...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {status === "success" && result && (
          <div style={{
            backgroundColor: "#d4edda",
            borderRadius: "8px",
            padding: "20px",
            textAlign: "left",
          }}>
            <p style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 600, color: "#155724" }}>
              ✅ Etiqueta generada
            </p>
            <div style={{ fontSize: "13px", color: "#155724", lineHeight: "1.8" }}>
              <div><strong>Orden:</strong> {result.orderName}</div>
              <div><strong>ID devolución:</strong> {result.returnOrderId}</div>
              <div><strong>Sucursal cliente:</strong> {result.nearestAgency || "Auto"}</div>
              <div><strong>Fecha:</strong> {result.createdAt}</div>
            </div>
            <p style={{
              margin: "16px 0 0",
              fontSize: "12px",
              color: "#666",
              fontStyle: "italic",
            }}>
              El envío aparecerá en MiCorreo → Pendientes.
              Pagalo y generá el rótulo desde ahí.
            </p>
          </div>
        )}

        {status === "error" && (
          <div style={{
            backgroundColor: "#f8d7da",
            borderRadius: "8px",
            padding: "20px",
          }}>
            <p style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 600, color: "#721c24" }}>
              ❌ Error
            </p>
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#721c24" }}>
              {errorMsg}
            </p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              style={{
                backgroundColor: "#721c24",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "8px 20px",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Footer */}
        <p style={{
          marginTop: "24px",
          fontSize: "11px",
          color: "#999",
        }}>
          Correo Argentino × Indy — Gestión de devoluciones
        </p>
      </div>
    </div>
  );
}

export default function ReturnPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Cargando...</div>}>
      <ReturnPageContent />
    </Suspense>
  );
}
