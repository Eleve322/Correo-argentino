// ============================================================================
// OAuth flow to get Shopify Admin API access token
// Run: npx tsx scripts/shopify-oauth.ts
// ============================================================================

import http from "http";
import { URL } from "url";

const SHOP = "indy-com-ar.myshopify.com";
const CLIENT_ID = "c84045647b5418f210c07fd52810de39";
const CLIENT_SECRET = "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";
const SCOPES = "read_orders,write_orders,write_shipping,read_shipping";
const REDIRECT_URI = "http://localhost:3456/callback";
const PORT = 3456;

async function main() {
  console.log("🔐 Shopify OAuth Flow");
  console.log(`   Store: ${SHOP}`);
  console.log(`   Scopes: ${SCOPES}`);
  console.log("");

  // 1. Build auth URL
  const authUrl =
    `https://${SHOP}/admin/oauth/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  console.log("📋 Open this URL in your browser:");
  console.log(`\n   ${authUrl}\n`);

  // Try to open browser automatically
  const { exec } = await import("child_process");
  exec(`open "${authUrl}"`);

  // 2. Start local server to catch the callback
  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith("/callback")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get("code");
    const shop = url.searchParams.get("shop");

    if (!code) {
      res.writeHead(400);
      res.end("Missing code parameter");
      return;
    }

    console.log("📥 Callback received");
    console.log(`   Shop: ${shop}`);
    console.log("🔄 Exchanging code for access token...");

    try {
      // 3. Exchange code for token
      const tokenRes = await fetch(
        `https://${SHOP}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code,
          }),
        }
      );

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        throw new Error(`Token exchange failed (${tokenRes.status}): ${errorText}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const grantedScopes = tokenData.scope;

      console.log("");
      console.log("✅ Access Token obtained!");
      console.log(`   Token: ${accessToken}`);
      console.log(`   Scopes: ${grantedScopes}`);
      console.log("");
      console.log("📋 Add this to your .env.local:");
      console.log(`   SHOPIFY_ADMIN_ACCESS_TOKEN=${accessToken}`);
      console.log(`   SHIPPING_WEBHOOK_SECRET=${CLIENT_SECRET}`);

      // 4. Test the token
      console.log("\n🧪 Testing token...");
      const testRes = await fetch(
        `https://${SHOP}/admin/api/2025-04/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query: "{ shop { name myshopifyDomain plan { displayName } } }",
          }),
        }
      );

      const testData = await testRes.json();
      if (testData.data?.shop) {
        console.log(`   ✅ Shop: ${testData.data.shop.name}`);
        console.log(`   ✅ Domain: ${testData.data.shop.myshopifyDomain}`);
        console.log(`   ✅ Plan: ${testData.data.shop.plan?.displayName}`);
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html><body style="font-family:system-ui;padding:2rem;text-align:center">
          <h1>✅ Conectado exitosamente</h1>
          <p>Token obtenido para <strong>${shop}</strong></p>
          <p>Ya podés cerrar esta ventana.</p>
        </body></html>
      `);
    } catch (error) {
      console.error("❌ Error:", error);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<html><body><h1>Error</h1><pre>${error}</pre></body></html>`);
    }

    // Close server after a brief delay
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  });

  server.listen(PORT, () => {
    console.log(`⏳ Waiting for OAuth callback on http://localhost:${PORT}...`);
    console.log("   (The browser should open automatically)\n");
  });
}

main().catch(console.error);
