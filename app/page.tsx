export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>🚚 Correo Argentino × Shopify API</h1>
      <p>This is the API backend for the Correo Argentino shipping integration.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/shipping/validate</code> — Check configuration</li>
        <li><code>POST /api/shipping/rates</code> — Carrier Service callback (Shopify checkout)</li>
        <li><code>POST /api/shipping/create</code> — Create shipment + label</li>
        <li><code>POST /api/shipping/labels</code> — Get shipping labels</li>
        <li><code>POST /api/shipping/tracking</code> — Query tracking history</li>
        <li><code>GET /api/shipping/agencies</code> — List branch offices</li>
        <li><code>POST /api/shipping/cancel</code> — Cancel shipment</li>
        <li><code>POST /api/webhooks/orders-paid</code> — Shopify webhook</li>
      </ul>
    </main>
  );
}
