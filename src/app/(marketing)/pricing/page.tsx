import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/marketing/sections";
import { PricingTable } from "@/components/marketing/pricing-table";
import { FaqList } from "@/components/marketing/faq-list";
import { FAQS } from "@/lib/marketing-content";
import { priceLabel, TRIAL_DAYS } from "@/lib/plans";
import { getPlans } from "@/lib/data/billing";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  // The description quotes real prices, so it is generated from the same rows
  // the table renders rather than from a second copy of the figures.
  const plans = await getPlans();
  const list = plans.map((p) => `${p.name} ${priceLabel(p)}`).join(", ");
  return {
    title: "Pricing",
    description: `EDOSPMIS pricing: ${list} a month, plus a one-off onboarding fee quoted with your plan. ${TRIAL_DAYS} days free.`,
    alternates: { canonical: "/pricing" },
  };
}

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <SectionHeading
            eyebrow="Pricing"
            title="Priced for the organisation, not per seat"
            lead={`Three plans. Every one of them starts with ${TRIAL_DAYS} days free and no card, and carries a one-off onboarding fee we quote in writing before you commit.`}
          />
          <div className="mt-10">
            <PricingTable plans={plans} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- what changes -- */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <SectionHeading
          eyebrow="Choosing"
          title="Which one is actually yours"
          lead="The honest version, rather than a feature matrix with ticks in every column."
        />

        <div className="mt-10 flex flex-col gap-4">
          {[
            {
              name: "Starter",
              who: "A single buying team that today runs on email, a spreadsheet and a folder of quotations.",
              why: "You get the case, the approval chain and the order — the part that stops a request going missing. Finance still happens in your accounting system.",
            },
            {
              name: "Growth",
              who: "An organisation where finance has to sign off what procurement bought.",
              why: "This is where the three-way match, the payment run and the contract signature live. Most organisations that were going to buy at all end up here.",
            },
            {
              name: "Pro",
              who: "Several departments buying against one budget, with an auditor at the end of the year.",
              why: "Delegation, evaluation committees, segregation of duties and the full audit log — the controls you need when no one person can see the whole picture.",
            },
          ].map((row) => (
            <div key={row.name} className="rounded-xl border border-line bg-surface p-6 shadow-card">
              <h3 className="font-display text-lg font-bold text-ink">{row.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">{row.who}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{row.why}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- FAQ -- */}
      <section id="faq" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Questions" title="Before you commit" />
          <div className="mt-8">
            <FaqList faqs={FAQS} />
          </div>

          <div className="mt-10 flex flex-col items-center gap-3 text-center">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-6 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              Start your {TRIAL_DAYS} days
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="text-sm text-ink-soft hover:text-brand">
              Or ask us a question first
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
