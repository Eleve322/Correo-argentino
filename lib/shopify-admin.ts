// ============================================================================
// Shopify Admin API Client
// For managing orders, metafields, and carrier service registration
// ============================================================================

const SHOPIFY_API_VERSION = "2025-04";

function getShopifyAdminConfig() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    throw new Error(
      "Missing Shopify Admin config. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN"
    );
  }

  return { domain, token };
}

/**
 * Execute a GraphQL query against the Shopify Admin API
 */
export async function shopifyAdminFetch<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const { domain, token } = getShopifyAdminConfig();

  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Admin API error ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(
      `Shopify GraphQL errors: ${JSON.stringify(json.errors)}`
    );
  }

  return json.data as T;
}

// ---------------------------------------------------------------------------
// Order operations
// ---------------------------------------------------------------------------

interface OrderNode {
  id: string;
  name: string;
  email: string;
  note: string | null;
  createdAt: string;
  totalPriceSet: {
    shopMoney: { amount: string; currencyCode: string };
  };
  shippingAddress: {
    firstName: string;
    lastName: string;
    name: string;
    address1: string;
    address2: string | null;
    city: string;
    province: string;
    provinceCode: string;
    zip: string;
    country: string;
    countryCodeV2: string;
    phone: string | null;
  } | null;
  shippingLines: {
    edges: {
      node: {
        title: string;
        code: string | null;
      };
    }[];
  };
  lineItems: {
    edges: {
      node: {
        title: string;
        quantity: number;
        variant: {
          weight: number;
          weightUnit: string;
        } | null;
      };
    }[];
  };
}

/**
 * Fetch a Shopify order by its GID or numeric ID
 */
export async function getOrderById(orderId: string): Promise<OrderNode | null> {
  const gid = orderId.startsWith("gid://")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  const data = await shopifyAdminFetch<{ node: OrderNode | null }>(
    `query GetOrder($id: ID!) {
      node(id: $id) {
        ... on Order {
          id
          name
          email
          note
          createdAt
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          shippingAddress {
            firstName lastName name
            address1 address2
            city province provinceCode
            zip country countryCodeV2 phone
          }
          shippingLines(first: 5) {
            edges { node { title code } }
          }
          lineItems(first: 50) {
            edges {
              node {
                title quantity
                variant { weight weightUnit }
              }
            }
          }
        }
      }
    }`,
    { id: gid }
  );

  return data.node;
}

/**
 * Update the note field on a Shopify order
 */
export async function updateOrderNote(
  orderId: string,
  note: string
): Promise<void> {
  const gid = orderId.startsWith("gid://")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  await shopifyAdminFetch(
    `mutation UpdateOrderNote($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { id note }
        userErrors { field message }
      }
    }`,
    {
      input: {
        id: gid,
        note,
      },
    }
  );
}

/**
 * Add a metafield to a Shopify order (e.g., tracking number, label URL)
 */
export async function addOrderMetafield(
  orderId: string,
  namespace: string,
  key: string,
  value: string,
  type: string = "single_line_text_field"
): Promise<void> {
  const gid = orderId.startsWith("gid://")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  await shopifyAdminFetch(
    `mutation SetOrderMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: gid,
          namespace,
          key,
          value,
          type,
        },
      ],
    }
  );
}

// ---------------------------------------------------------------------------
// Carrier Service Registration
// ---------------------------------------------------------------------------

/**
 * Register a Carrier Service with Shopify.
 * This should only be called once during setup.
 */
export async function registerCarrierService(
  callbackUrl: string,
  name: string = "Correo Argentino"
): Promise<{ id: string; name: string; callbackUrl: string }> {
  const data = await shopifyAdminFetch<{
    carrierServiceCreate: {
      carrierService: { id: string; name: string; callbackUrl: string } | null;
      userErrors: { field: string; message: string }[];
    };
  }>(
    `mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
      carrierServiceCreate(input: $input) {
        carrierService {
          id
          name
          callbackUrl
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: {
        name,
        callbackUrl,
        active: true,
        supportsServiceDiscovery: true,
      },
    }
  );

  const { carrierService, userErrors } = data.carrierServiceCreate;

  if (userErrors.length > 0) {
    throw new Error(
      `Failed to register carrier service: ${userErrors.map((e) => e.message).join(", ")}`
    );
  }

  if (!carrierService) {
    throw new Error("Carrier service was not created");
  }

  return carrierService;
}

// ---------------------------------------------------------------------------
// Webhook HMAC Verification
// ---------------------------------------------------------------------------

/**
 * Verify the HMAC signature of a Shopify webhook request.
 * Uses the SHIPPING_WEBHOOK_SECRET env var.
 */
export async function verifyShopifyWebhook(
  body: string,
  hmacHeader: string
): Promise<boolean> {
  const secret = process.env.SHIPPING_WEBHOOK_SECRET;

  if (!secret) {
    console.error("SHIPPING_WEBHOOK_SECRET not configured");
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computedHmac = Buffer.from(signature).toString("base64");

  return computedHmac === hmacHeader;
}
