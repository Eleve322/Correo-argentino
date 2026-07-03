const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/webhooks/orders-paid/route.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `    // 4. Check we have a shipping address`;

const replacement = `    // 3b. Check if the order is ON HOLD
    if (order.fulfillment_status === "on_hold" || order.fulfillment_status === "ON_HOLD" || (order as any).displayFulfillmentStatus === "ON_HOLD") {
      console.log(\`Order \${order.name} is ON_HOLD, skipping webhook import\`);
      return NextResponse.json({
        status: "skipped",
        reason: "Order is ON_HOLD",
      });
    }

    // 4. Check we have a shipping address`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Added ON_HOLD block to webhook');
