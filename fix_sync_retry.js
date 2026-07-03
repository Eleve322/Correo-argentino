const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `      let forceAppendedSuffix = "";
      if (alreadyImported || noteImported) {
        if (!forceReimport) {
          results.push({
            orderName: order.name,
            status: "skipped",
            reason: "Already imported",
          });
          continue;
        } else {
          // If it's forced and already imported, bypass MiCorreo duplicate error by appending -RE + random
          forceAppendedSuffix = "-RE" + Math.floor(Math.random() * 1000);
        }
      }`;

const replacement = `      let forceAppendedSuffix = "";
      if (!forceReimport && (alreadyImported || noteImported)) {
        results.push({
          orderName: order.name,
          status: "skipped",
          reason: "Already imported",
        });
        continue;
      }
      
      // If forced, ALWAYS append suffix to avoid any silent MiCorreo duplicates
      if (forceReimport) {
        forceAppendedSuffix = "-RE" + Math.floor(Math.random() * 1000);
      }`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed force suffix logic');
