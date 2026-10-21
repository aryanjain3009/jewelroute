import type { Metadata } from "next";
import { TrustAndCta } from "@/components/marketing/closing";
import { CustodySection } from "@/components/marketing/custody";
import { FieldDaySection } from "@/components/marketing/field-day";
import { Hero } from "@/components/marketing/hero";
import { IntegrationsSection } from "@/components/marketing/integrations";
import { ManagerSection } from "@/components/marketing/manager";
import { MotionRoot } from "@/components/marketing/reveal";
import { ProductShowcase } from "@/components/marketing/showcase";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { VerifiedVisitSection } from "@/components/marketing/visit";

const TITLE = "JewelRoute — the field sales operating system for jewellery";
const DESCRIPTION = "Know where every salesman went, and where every gram went with them. GPS-verified retailer visits with arrival proof, orders priced from today's gold rate, and a custody record for every sample.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "JewelRoute", locale: "en_IN" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function Landing() {
  return (
    <MotionRoot>
      <div className="min-h-dvh bg-white text-ink">
        <SiteHeader />
        <main>
          <Hero />
          <ProductShowcase />
          <VerifiedVisitSection />
          <CustodySection />
          <FieldDaySection />
          <ManagerSection />
          <IntegrationsSection />
          <TrustAndCta />
        </main>
        <SiteFooter />
      </div>
    </MotionRoot>
  );
}
