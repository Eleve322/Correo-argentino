const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /for \(const order of ordersToSync\) \{\r?\n\s*\/\/ Check if already imported via metafield/g,
  'for (const order of ordersToSync) {\n      // Skip ON_HOLD orders\n      const fulfillmentStatus = order.displayFulfillmentStatus || "";\n      if (fulfillmentStatus === "ON_HOLD") {\n        results.push({ orderName: order.name, status: "skipped", reason: "Order is ON_HOLD" });\n        continue;\n      }\n\n      // Check if already imported via metafield'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed sync-orders/route.ts properly');
