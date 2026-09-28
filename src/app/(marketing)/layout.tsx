import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* The header is fixed so a full-bleed hero can run beneath it; this
          padding is what every other page sits below. */}
      <main className="flex-1 pt-16">{children}</main>
      <SiteFooter />
    </div>
  );
}
