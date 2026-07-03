const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const nameWithPhone = addr.phone ? \\  CEL \\.trim() : \\ \\.trim();',
  'const nameWithPhone = addr.phone ? `${addr.firstName} ${addr.lastName} CEL ${addr.phone}`.trim() : `${addr.firstName} ${addr.lastName}`.trim();'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed nameWithPhone backticks');
