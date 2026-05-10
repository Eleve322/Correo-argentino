// ============================================================================
// Register Carrier Service in Shopify
// Run once: npx tsx scripts/register-carrier.ts
// ============================================================================

import { registerCarrierService } from "../lib/shopify-admin";

async function main() {
  const callbackUrl = process.argv[2];

  if (!callbackUrl) {
    console.error("Usage: npx tsx scripts/register-carrier.ts <callback-url>");
    console.error(
      "Example: npx tsx scripts/register-carrier.ts https://your-app.vercel.app/api/shipping/rates"
    );
    process.exit(1);
  }

  console.log("🚚 Registering Correo Argentino Carrier Service...");
  console.log(`   Store: ${process.env.SHOPIFY_STORE_DOMAIN}`);
  console.log(`   Callback URL: ${callbackUrl}`);

  try {
    const result = await registerCarrierService(callbackUrl, "Correo Argentino");
    console.log("\n✅ Carrier Service registered successfully!");
    console.log(`   ID: ${result.id}`);
    console.log(`   Name: ${result.name}`);
    console.log(`   Callback URL: ${result.callbackUrl}`);
    console.log(
      "\n📋 Next steps:"
    );
    console.log(
      '   1. Go to Shopify Admin → Settings → Shipping and delivery'
    );
    console.log(
      '   2. Verify "Correo Argentino" appears as a carrier'
    );
    console.log("   3. Test a checkout to confirm rates appear");
  } catch (error) {
    console.error("\n❌ Failed to register carrier service:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
