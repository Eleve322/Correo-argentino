const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/lib/micorreo.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
\unction buildObservations(rawAddress2?: string, parsedObservations?: string): string {
  const parts: string[] = [];

  // Always include the full address2 if it exists — safety net
  const addr2 = (rawAddress2 || \\"\\").trim();
  if (addr2) {
    parts.push(addr2);
  }

  // If parseShopifyAddress extracted specific observation text that's
  // different from address2, include it too (avoid duplicates)
  const obs = (parsedObservations || \\"\\").trim();
  if (obs && obs !== addr2 && !addr2.includes(obs)) {
    parts.push(obs);
  }

  return parts.join(\\" | \\");
}\,
\unction buildObservations(rawAddress2?: string, parsedObservations?: string): string {
  // Option A: Just use the smartly parsed observations from parseShopifyAddress.
  // It already guarantees that no part of address2 is lost (they either go to streetName or observations).
  return (parsedObservations || \\"\\").trim();
}\
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed buildObservations!');
