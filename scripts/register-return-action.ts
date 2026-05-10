// ============================================================================
// Script: Register "Generar etiqueta de devolución" admin action in Shopify
// Run: npx tsx scripts/register-return-action.ts
// ============================================================================

async function main() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const appUrl = "https://app-one-azure-17.vercel.app";

  if (!domain || !token) {
    console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  // Register the order action link via REST API
  const url = `https://${domain}/admin/api/2025-04/graphql.json`;

  // First, check if we have any existing navigation links
  const checkRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query: `{
        app {
          id
          title
        }
      }`,
    }),
  });

  const checkData = await checkRes.json();
  console.log("App info:", JSON.stringify(checkData, null, 2));

  // The admin action link needs to be configured in the app setup
  // For custom apps, we use the "order action" extension
  // The URL format Shopify will call is:
  // {app_url}/return?id={order_id}&name={order_name}&shop={shop}

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  Para agregar "Generar etiqueta de devolución" en Más Acciones:        ║
║                                                                        ║
║  1. Ir a Shopify Admin → Settings → Apps and sales channels            ║
║  2. Click en tu app (la que tiene el token de acceso)                  ║
║  3. Click en "Configure" o "App setup"                                 ║
║  4. En "App extensions" o "Admin links", agregar:                      ║
║                                                                        ║
║     Label: Correo Argentino - Etiqueta de devolución                   ║
║     Target: Order detail                                               ║
║     URL: ${appUrl}/return?id={{order_id}}&name={{order_name}}          ║
║                                                                        ║
║  Si no tenés esa opción, podés usar el Flow:                           ║
║  5. Ir a Settings → Notifications → Webhooks                          ║
║     Y crear un admin link manualmente.                                 ║
╚══════════════════════════════════════════════════════════════════════════╝
  `);
}

main().catch(console.error);
