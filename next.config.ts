import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Allow Shopify Admin to embed this app in an iframe
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://admin.shopify.com https://indy-com-ar.myshopify.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
