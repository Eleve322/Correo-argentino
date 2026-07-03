const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/app/api/shipping/sync-orders/route.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `      if (exactOrderNameInput && (financialStatus === "PENDING" || financialStatus === "PARTIALLY_PAID")) {
        results.push({ orderName: order.name, status: "error", reason: "Pedido pendiente de pago" });
        continue;
          orderName: order.name,
          status: "error",
          reason: msg,
        });`;

const replacement = `      if (exactOrderNameInput && (financialStatus === "PENDING" || financialStatus === "PARTIALLY_PAID")) {
        results.push({ orderName: order.name, status: "error", reason: "Pedido pendiente de pago" });
        continue;
      }

      const alreadyImported = order.metafields.edges.some(
        (mf) => mf.node.namespace === "correo_argentino" && mf.node.key === "imported_at"
      );

      // Also check note for import marker
      const noteImported = order.note?.includes("Correo Argentino - Env\u00EDo importado");

      let forceAppendedSuffix = "";
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
      }

      if (!order.shippingAddress) {
        results.push({
          orderName: order.name,
          status: "skipped",
          reason: "No shipping address",
        });
        continue;
      }

      try {
        // Determine delivery type and agency from shipping line
        const shippingLine = order.shippingLines.edges[0]?.node;
        const shippingTitle = shippingLine?.title?.toLowerCase() || "";
        const shippingCode = shippingLine?.code || "";

        const deliveryType = shippingTitle.includes("suc.") ? "S" : "D";

        let agencyCode;
        if (deliveryType === "S") {
          const codeMatch = shippingCode.match(
            /correo-argentino-sucursal-(?:cl\u00E1sico-|clasico-)?(.+)/i
          );
          agencyCode = codeMatch?.[1];
        }

        // Estimate weight from item count (fallback since we don't have grams in GraphQL easily)
        const totalItems = order.lineItems.edges.reduce(
          (sum, li) => sum + li.node.quantity,
          0
        );
        const estimatedWeight = Math.max(totalItems * 400, 200); // ~400g per item (conservative avg)

        const addr = order.shippingAddress;
        const nameWithPhone = addr.phone ? \`\${addr.firstName} \${addr.lastName} CEL \${addr.phone}\`.trim() : \`\${addr.firstName} \${addr.lastName}\`.trim();
        const shipmentData = buildShipmentRequest({
          orderName: order.name + orderSuffix + forceAppendedSuffix,
          orderId: order.id.split("/").pop() || "",
          recipient: {
            name: nameWithPhone,
            email: order.email,
            phone: addr.phone || "",
            address1: addr.address1,
            address2: addr.address2 || undefined,
            city: addr.city,
            provinceCode: addr.provinceCode,
            zip: addr.zip,
          },
          weightGrams: estimatedWeight,
          declaredValue: parseFloat(order.totalPriceSet.shopMoney.amount),
          deliveryType,
          agencyCode,
          itemCount: totalItems,
        });

        const result = await importShipment(shipmentData);

        // Mark as imported in Shopify
        const numericId = order.id.split("/").pop() || "";
        try {
          await addOrderMetafield(numericId, "correo_argentino", "imported_at", result.createdAt);
          const notePrefix = order.note ? \`\${order.note}\\n\` : "";
          await updateOrderNote(
            numericId,
            \`\${notePrefix}\uD83D\uDCE6 Correo Argentino - Env\u00EDo importado (\${result.createdAt})\`
          );
        } catch {
          // Non-critical
        }

        results.push({
          orderName: order.name,
          status: "imported",
          reason: forceAppendedSuffix 
             ? \`\u26A0\uFE0F Re-generada exitosamente (ya exist\u00EDa). Nueva etiqueta: \${order.name}\${orderSuffix}\${forceAppendedSuffix}\`
             : \`Imported at \${result.createdAt}\`,
        });

        console.log(\`\u2705 Imported \${order.name}\`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        results.push({
          orderName: order.name,
          status: "error",
          reason: msg,
        });`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Restored sync-orders successfully');
