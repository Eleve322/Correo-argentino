const fs = require('fs');
const file = 'c:/Users/wanle.INDY/.gemini/antigravity/playground/baryonic-shepard/Correo-argentino/lib/micorreo.ts';
let content = fs.readFileSync(file, 'utf8');

// Append the new function
content += `
export function calculatePackageAndWeight(lineItems: { title: string; quantity: number }[]) {
  let zapatillas = 0;
  let buzos = 0;
  let pantalones = 0;
  let remeras = 0;
  let gorras = 0;
  let accesorios = 0;
  let weightGrams = 0;

  for (const item of lineItems) {
    const title = item.title.toLowerCase();
    const qty = item.quantity;

    if (title.includes('zapatilla') || title.includes('borcego') || title.includes('botín') || title.includes('bota')) {
      zapatillas += qty;
      weightGrams += qty * (title.includes('borcego') ? 1600 : 800);
    } else if (title.includes('buzo') || title.includes('campera') || title.includes('mochila') || title.includes('sweater')) {
      buzos += qty;
      weightGrams += qty * (title.includes('mochila') ? 650 : 550);
    } else if (title.includes('pantalon') || title.includes('pantalón') || title.includes('short') || title.includes('bermuda') || title.includes('jean')) {
      pantalones += qty;
      weightGrams += qty * 400;
    } else if (title.includes('remera') || title.includes('chomba') || title.includes('musculosa') || title.includes('camisa') || title.includes('top')) {
      remeras += qty;
      weightGrams += qty * 200;
    } else if (title.includes('gorra') || title.includes('piluso') || title.includes('sombrero')) {
      gorras += qty;
      weightGrams += qty * 90;
    } else {
      accesorios += qty;
      weightGrams += qty * 60;
    }
  }

  if (weightGrams === 0) weightGrams = 100;

  const totalClothes = remeras + (pantalones * 2) + (buzos * 4);
  let dims = { height: 3, width: 18, length: 25 }; 

  if (zapatillas >= 3) {
    dims = { height: 28, width: 39, length: 49 }; 
  } else if (zapatillas === 2) {
    dims = { height: 23, width: 26, length: 37 }; 
  } else if (zapatillas === 1) {
    if (totalClothes >= 4 || gorras > 0) {
      dims = { height: 23, width: 26, length: 37 }; 
    } else {
      dims = { height: 9, width: 23, length: 35 }; 
    }
  } else {
    if (gorras > 0) {
      if (totalClothes === 0 && accesorios === 0) {
        dims = { height: 20, width: 20, length: 20 }; 
      } else {
        dims = { height: 9, width: 23, length: 35 }; 
      }
    } else {
      if (totalClothes > 6) {
        dims = { height: 23, width: 26, length: 37 }; 
      } else if (totalClothes > 4) {
        dims = { height: 9, width: 23, length: 35 }; 
      } else if (totalClothes > 1) {
        dims = { height: 3, width: 24, length: 29 }; 
      } else {
        dims = { height: 3, width: 18, length: 25 }; 
      }
    }
  }

  return { weightGrams, dimensions: dims };
}
`;

// Replace the interface carefully
content = content.replace(
  '  /** Weight in grams */\r\n  weightGrams: number;\r\n  /** Dimensions in cm */\r\n  dimensions?: { height: number; width: number; length: number };',
  '  /** Line items for calc */\n  lineItems: { title: string; quantity: number }[];'
);
content = content.replace(
  '  /** Weight in grams */\n  weightGrams: number;\n  /** Dimensions in cm */\n  dimensions?: { height: number; width: number; length: number };',
  '  /** Line items for calc */\n  lineItems: { title: string; quantity: number }[];'
);

content = content.replace(
  '  /** Total item count */\r\n  itemCount?: number;\r\n',
  ''
);
content = content.replace(
  '  /** Total item count */\n  itemCount?: number;\n',
  ''
);

// Replace buildShipmentRequest logic
content = content.replace(
  'const dims = input.dimensions ?? estimateDimensionsFromWeight(input.weightGrams, input.itemCount || 1);',
  'const { weightGrams, dimensions: dims } = calculatePackageAndWeight(input.lineItems);'
);
content = content.replace(
  'weight: input.weightGrams,',
  'weight: weightGrams,'
);

// We keep estimateDimensionsFromWeight in the file just unused to avoid regex bugs.

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed micorreo.ts safely');
