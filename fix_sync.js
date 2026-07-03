const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Suffix parsing
content = content.replace(
  'const exactOrderName: string | undefined = body.exactOrderName;',
  'const exactOrderNameInput: string | undefined = body.exactOrderName;\n    let exactOrderName = exactOrderNameInput;\n    let orderSuffix = "";\n    if (exactOrderNameInput && exactOrderNameInput.includes("-")) {\n      const parts = exactOrderNameInput.split("-");\n      orderSuffix = "-" + parts.slice(1).join("-");\n      exactOrderName = parts[0];\n    }'
);

// 2. Financial status fetching
content = content.replace(
  'displayFulfillmentStatus\n            totalPriceSet { shopMoney { amount } }',
  'displayFulfillmentStatus\n            displayFinancialStatus\n            totalPriceSet { shopMoney { amount } }'
);

// 3. Financial status blocking
content = content.replace(
  'const alreadyImported = order.metafields.edges.some(',
  'const financialStatus = (order as any).displayFinancialStatus || "";\n      if (exactOrderNameInput && (financialStatus === "PENDING" || financialStatus === "PARTIALLY_PAID")) {\n        results.push({ orderName: order.name, status: "error", reason: "Pedido pendiente de pago" });\n        continue;\n      }\n\n      const alreadyImported = order.metafields.edges.some('
);

// 4. Phone name append & order suffix inject
content = content.replace(
  'const addr = order.shippingAddress;\n        const shipmentData = buildShipmentRequest({\n          orderName: order.name,',
  'const addr = order.shippingAddress;\n        const nameWithPhone = addr.phone ? `${addr.firstName} ${addr.lastName} CEL ${addr.phone}`.trim() : `${addr.firstName} ${addr.lastName}`.trim();\n        const shipmentData = buildShipmentRequest({\n          orderName: order.name + orderSuffix,'
);
content = content.replace(
  'name: `${addr.firstName} ${addr.lastName}`.trim(),',
  'name: nameWithPhone,'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed sync-orders/route.ts');
