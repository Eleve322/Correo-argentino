const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `      const alreadyImported = order.metafields.edges.some(
        (mf) => mf.node.namespace === "correo_argentino" && mf.node.key === "imported_at"
      );

      // Also check note for import marker
      const noteImported = order.note?.includes("Correo Argentino - Env\u00EDo importado");

      if (!forceReimport && (alreadyImported || noteImported)) {
        results.push({
          orderName: order.name,
          status: "skipped",
          reason: "Already imported",
        });
        continue;
      }`;

const replacement1 = `      const alreadyImported = order.metafields.edges.some(
        (mf) => mf.node.namespace === "correo_argentino" && mf.node.key === "imported_at"
      );

      // Also check note for import marker
      const noteImported = order.note?.includes("Correo Argentino - Env\u00EDo importado");

      let forceAppendedSuffix = "";
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

const target2 = `const shipmentData = buildShipmentRequest({
          orderName: order.name + orderSuffix,
          orderId: order.id.split("/").pop() || "",`;

const replacement2 = `const shipmentData = buildShipmentRequest({
          orderName: order.name + orderSuffix + forceAppendedSuffix,
          orderId: order.id.split("/").pop() || "",`;

const target3 = `        results.push({
          orderName: order.name,
          status: "imported",
          reason: \`Imported at \${result.createdAt}\`,
        });`;

const replacement3 = `        results.push({
          orderName: order.name,
          status: "imported",
          reason: forceAppendedSuffix 
             ? \`\u26A0\uFE0F Re-generada exitosamente (ya exist\u00EDa). Nueva etiqueta: \${order.name}\${orderSuffix}\${forceAppendedSuffix}\`
             : \`Imported at \${result.createdAt}\`,
        });`;

content = content.replace(target1, replacement1);
content = content.replace(target2, replacement2);
content = content.replace(target3, replacement3);

fs.writeFileSync(file, content, 'utf8');
console.log('Modified sync-orders for force reimport suffix');
