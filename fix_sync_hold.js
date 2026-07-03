const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    for (const order of ordersToSync) {
      // Check if already imported via metafield (skip if force=true)`;

const replacement = `    for (const order of ordersToSync) {
      // Skip ON_HOLD orders (exchanges in waiting state)
      const fulfillmentStatus = order.displayFulfillmentStatus || "";
      if (fulfillmentStatus === "ON_HOLD") {
        results.push({ orderName: order.name, status: "skipped", reason: "Order is ON_HOLD" });
        continue;
      }

      // Check if already imported via metafield (skip if force=true)`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Added ON_HOLD block to sync-orders');
