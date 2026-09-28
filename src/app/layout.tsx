import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// Public pages only — see globals.css. The working application never uses it,
// so it costs /app nothing but a preloaded font file on the marketing routes.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: {
    default: "EDOSPMIS — procurement and service delivery, end to end",
    template: "%s · EDOSPMIS",
  },
  description:
    "EDOSPMIS runs the whole procurement cycle — requisition, approval, sourcing, purchase order, goods received, three-way match, payment and close-out — with one audit trail behind it.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1d3557",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
