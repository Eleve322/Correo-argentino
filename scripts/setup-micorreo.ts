// ============================================================================
// Setup MiCorreo — Get customerId
// Run: npx tsx scripts/setup-micorreo.ts
//
// This script helps you get your MiCorreo customerId by either:
// 1. Validating an existing MiCorreo account (email + password)
// 2. Registering a new one
// ============================================================================

import * as readline from "readline";

const BASE_URL = process.env.MICORREO_API_URL || "https://apitest.correoargentino.com.ar/micorreo/v1";
const API_USER = process.env.MICORREO_USER;
const API_PASSWORD = process.env.MICORREO_PASSWORD;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getToken(): Promise<string> {
  if (!API_USER || !API_PASSWORD) {
    throw new Error("Set MICORREO_USER and MICORREO_PASSWORD in .env.local first");
  }

  const credentials = Buffer.from(`${API_USER}:${API_PASSWORD}`).toString("base64");

  const res = await fetch(`${BASE_URL}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    throw new Error(`Auth failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.token;
}

async function validateUser(token: string, email: string, password: string) {
  const res = await fetch(`${BASE_URL}/users/validate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Validate failed (${res.status})`);
  }

  return res.json();
}

async function registerUser(
  token: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    documentType: string;
    documentId: string;
    phone?: string;
  }
) {
  const res = await fetch(`${BASE_URL}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...data,
      address: {
        streetName: process.env.SENDER_STREET || "",
        streetNumber: process.env.SENDER_STREET_NUMBER || "",
        city: process.env.SENDER_CITY || "",
        provinceCode: process.env.SENDER_STATE || "B",
        postalCode: process.env.SENDER_ZIPCODE || "",
      },
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Register failed (${res.status})`);
  }

  return res.json();
}

async function main() {
  console.log("🔧 MiCorreo Setup — Obtener customerId\n");
  console.log(`   API URL: ${BASE_URL}`);
  console.log(`   API User: ${API_USER || "NOT SET"}\n`);

  // Step 1: Get token
  console.log("1️⃣  Obteniendo token JWT...");
  const token = await getToken();
  console.log("   ✅ Token obtenido\n");

  // Step 2: Ask what to do
  const choice = await ask(
    "¿Tenés una cuenta MiCorreo existente? (s/n): "
  );

  if (choice.toLowerCase() === "s") {
    // Validate existing account
    const email = await ask("   Email de MiCorreo: ");
    const password = await ask("   Contraseña de MiCorreo: ");

    console.log("\n2️⃣  Validando usuario...");
    const result = await validateUser(token, email, password);

    console.log("\n✅ Usuario validado!");
    console.log(`   customerId: ${result.customerId}`);
    console.log(`   Creado: ${result.createdAt}`);
    console.log(`\n📋 Agregá esto a tu .env.local:`);
    console.log(`   MICORREO_CUSTOMER_ID=${result.customerId}\n`);
  } else {
    // Register new account
    console.log("\n📝 Registrar nueva cuenta MiCorreo:\n");
    const firstName = await ask("   Nombre: ");
    const lastName = await ask("   Apellido: ");
    const email = await ask("   Email: ");
    const password = await ask("   Contraseña: ");
    const docType = await ask("   Tipo documento (DNI/CUIT): ");
    const docId = await ask(`   Número de ${docType}: `);
    const phone = await ask("   Teléfono (opcional): ");

    console.log("\n2️⃣  Registrando usuario...");
    const result = await registerUser(token, {
      firstName,
      lastName,
      email,
      password,
      documentType: docType.toUpperCase(),
      documentId: docId,
      phone: phone || undefined,
    });

    console.log("\n✅ Usuario registrado!");
    console.log(`   customerId: ${result.customerId}`);
    console.log(`   Creado: ${result.createdAt}`);
    console.log(`\n📋 Agregá esto a tu .env.local:`);
    console.log(`   MICORREO_CUSTOMER_ID=${result.customerId}\n`);
  }
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
