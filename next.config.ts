import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Tenant-uploaded documents/logos are served from Supabase Storage on
    // the shared project this app's edospmis_ tables live in (see
    // ARCHITECTURE.md §2 — same project as edos-poa / edoshatch360).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cnlyuwslpcgosgwdmzav.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
