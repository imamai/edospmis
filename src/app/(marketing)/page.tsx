import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ClipboardList,
  FileSignature,
  Gavel,
  PackageCheck,
  Receipt,
  ScrollText,
  Scale,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import { Hero } from "@/components/marketing/hero";
import { FeatureBlock, SectionHeading } from "@/components/marketing/sections";
import { BrowserFrame, LaptopFrame, PhoneFrame } from "@/components/marketing/device-frames";
import { PricingTable } from "@/components/marketing/pricing-table";
import { FaqList } from "@/components/marketing/faq-list";
import { FAQS } from "@/lib/marketing-content";
import { priceLabel, TRIAL_DAYS } from "@/lib/plans";
import { getPlans } from "@/lib/data/billing";

export const metadata: Metadata = {
  // Absolute: the root template appends "· EDOSPMIS", which on the page that
  // already says EDOSPMIS reads as a stutter.
  title: { absolute: "EDOSPMIS — procurement and service delivery, end to end" },
  description:
    "Requisition, approval, sourcing, award, delivery, inspection, three-way match, payment and close-out — one case, one timeline, one audit trail. Built in Kenya.",
  alternates: { canonical: "/" },
};

const TRUST = [
  { icon: ScrollText, label: "One case per purchase", note: "Not a folder, a spreadsheet and an inbox" },
  { icon: ShieldCheck, label: "Controls that refuse", note: "Not warnings somebody can click past" },
  { icon: Users, label: "Roles enforced in the database", note: "Not hidden buttons in the interface" },
  { icon: Scale, label: "An auditor can follow it", note: "Every decision, with who and when" },
];

/** The stages a case actually moves through, in the order the product moves them. */
const STAGES = [
  { icon: ClipboardList, title: "Request", note: "Raised with a need, a budget line and a quantity" },
  { icon: FileSignature, title: "Approval", note: "Routed by threshold, decided with a reason" },
  { icon: Gavel, title: "Sourcing", note: "Quotations compared, one award recorded" },
  { icon: Truck, title: "Delivery", note: "A purchase order the supplier can act on" },
  { icon: PackageCheck, title: "Receiving", note: "Goods received note, with what was short or rejected" },
  { icon: Receipt, title: "Finance", note: "Invoice matched to order and receipt before approval" },
  { icon: Wallet, title: "Close-out", note: "Paid, filed, and closed with the trail intact" },
];

// The price list is a database read, so the page revalidates hourly rather
// than being frozen at build time: a price change appears within the hour
// without a redeploy.
export const revalidate = 3600;

export default async function LandingPage() {
  const plans = await getPlans();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "EDOS Centre",
        url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        email: "info@edoscentre.co.ke",
        areaServed: "KE",
      },
      {
        "@type": "SoftwareApplication",
        name: "EDOSPMIS",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "Procurement and service delivery management: requisitions, approvals, sourcing, purchase orders, goods received notes, three-way match, payments and contracts.",
        offers: plans.map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: (p.priceCents / 100).toFixed(2),
          priceCurrency: p.currency,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Hero />

      {/* ---------------------------------------------------- trust bar -- */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <p className="text-center text-sm font-medium text-ink-soft">
            Built for organisations that have to show their workings.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, label, note }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{label}</p>
                  <p className="mt-0.5 text-xs leading-snug text-ink-faint">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- how it works -- */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading
          eyebrow="How it works"
          title="Seven stages, and a case can only be at one of them"
          lead="The stage is not a label somebody types. It moves when the work moves — when the approval is decided, when the goods are received, when the invoice matches — so the register is the truth rather than a summary of it."
        />

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ icon: Icon, title, note }, i) => (
            <li
              key={title}
              className="mk-lift relative flex flex-col rounded-xl border border-line bg-surface p-5 shadow-card"
            >
              <span className="absolute top-4 right-4 font-display text-xs font-bold text-ink-faint tnum">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-snug text-ink-soft">{note}</p>
            </li>
          ))}

          <li className="flex flex-col justify-center rounded-xl border border-dashed border-line-strong p-5">
            <p className="text-sm leading-relaxed text-ink-soft">
              Put a case on hold, mark it blocked, cancel it or return it for more
              information at any stage — and the timeline keeps every one of those
              decisions.
            </p>
          </li>
        </ol>
      </section>

      {/* --------------------------------------------- real screenshots -- */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            eyebrow="The actual product"
            title="This is the software, not an illustration"
            lead="Real screens from a working demonstration organisation. The buyer sees the whole pipeline; the person raising a request sees only what they have to do."
          />

          <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
            <LaptopFrame
              src="/images/app/desk-requisitions.png"
              alt="The EDOSPMIS requisition pipeline: open requisitions, value in pipeline, a stage-by-stage chevron chain, and the register of purchase requests with the selected one shown alongside"
              caption="Requisition pipeline — every open request, the stage it is at, and what it is worth."
            />

            <div className="grid grid-cols-2 gap-6">
              <PhoneFrame
                src="/images/app/phone-requisitions.png"
                alt="The requisition pipeline on a phone, with the figures stacked and the register below them"
              />
              <PhoneFrame
                src="/images/app/phone-home.png"
                alt="The home screen on a phone, showing what is waiting on this person today"
              />
            </div>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <BrowserFrame
              src="/images/app/desk-dashboard.png"
              alt="The EDOSPMIS dashboard, showing spend, cases by stage and what is overdue"
              caption="The dashboard: what is moving, what is stuck, and what it is costing."
            />
            <BrowserFrame
              src="/images/app/desk-reports.png"
              alt="The EDOSPMIS reports index, listing procurement, finance and delivery reports"
              caption="Reports that export as they look — PDF, Excel or CSV."
            />
          </div>

          <p className="mt-8 text-center text-sm text-ink-soft">
            Every new workspace opens on the same screens, empty and waiting for your
            first request.{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              Start one
            </Link>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------- three-way match -- */}
      <section id="controls" className="mk-dark relative overflow-hidden">
        <div className="mk-grid-lines absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-20">
          <div>
            <SectionHeading
              align="left"
              tone="dark"
              eyebrow="Three-way match"
              title="An invoice has to agree with the order and the delivery"
              lead="Before an invoice can be approved, it is checked line by line against what was ordered and what was actually received — price, quantity and cumulative totals across every part-invoice. Anything outside your tolerance becomes an exception somebody has to resolve by name, not a figure that quietly goes through."
            />
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-white"
            >
              What each plan includes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mk-glass rounded-2xl p-6">
            <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
              PO-2026-000418 · Match result
            </p>

            <dl className="mt-5 flex flex-col gap-3">
              {[
                ["Ordered", "120 units", "KES 540,000", "ok"],
                ["Received", "118 units", "2 short, noted on the GRN", "ok"],
                ["Invoiced", "120 units", "KES 540,000", "flag"],
              ].map(([label, figure, note, tone]) => (
                <div
                  key={label as string}
                  className="flex items-baseline gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="w-24 shrink-0 text-xs text-white/65">{label}</dt>
                  <dd className="flex-1 text-sm text-white tnum">
                    {figure}
                    <span className="ml-2 text-xs text-white/45">{note}</span>
                  </dd>
                  <span
                    className={
                      tone === "ok"
                        ? "h-2 w-2 shrink-0 rounded-full bg-good"
                        : "h-2 w-2 shrink-0 rounded-full bg-accent"
                    }
                    aria-hidden="true"
                  />
                </div>
              ))}
            </dl>

            <div className="mt-5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
              <p className="text-sm font-semibold text-white">Over-billing exception</p>
              <p className="mt-1 text-xs leading-relaxed text-white/70">
                Billed for 120 against 118 received. Approval is blocked until
                somebody resolves this — with a credit note, a second delivery, or
                a written reason that stays on the case.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- capabilities -- */}
      <section
        id="capabilities"
        className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-16 sm:px-6 lg:gap-24 lg:py-24"
      >
        <FeatureBlock
          id="requests"
          eyebrow="Request & approval"
          title="A request that carries its own justification"
          body="Anyone who is allowed to ask, asks — with the item, the quantity, the budget line and the reason attached. The approval chain is chosen by your own thresholds, not by whoever happens to be in the office."
          points={[
            "Approval routed by value, department and category",
            "Decisions recorded with a reason, never just a status change",
            "Return for more information without losing the request",
            "SLA clock on each stage, so a request cannot quietly sit",
          ]}
          image="/images/marketing/requisition.jpg"
          alt="A hand signing a printed request form at a desk"
        />

        <FeatureBlock
          id="sourcing"
          eyebrow="Sourcing & award"
          title="Compare quotations side by side, then award once"
          body="Invite suppliers, record what each quoted, and award on the record. The purchase order is generated from the award, so the order cannot disagree with the decision behind it."
          points={[
            "Supplier register with contacts, categories and history",
            "Quotations captured per supplier and compared in one table",
            "Award with a reason, and a purchase order raised from it",
            "Contracts issued for signature and countersigned in the system",
          ]}
          image="/images/marketing/evaluation.jpg"
          alt="A team standing in discussion in an office"
          flip
        />

        <FeatureBlock
          id="receiving"
          eyebrow="Receiving & inspection"
          title="What arrived, not what was promised"
          body="Goods received notes record the quantity actually delivered, against the order, with shortfalls and rejects noted at the line. Part deliveries are normal and the order stays open until it is genuinely complete."
          points={[
            "Part deliveries, with a running received-to-date per line",
            "Inspection outcome recorded separately from receipt",
            "The order closes itself when everything has been received",
            "Receipt is a precondition for invoicing, not a formality",
          ]}
          image="/images/marketing/receiving.jpg"
          alt="A stores clerk checking parcels on the racks against a clipboard"
        />

        <FeatureBlock
          id="finance"
          eyebrow="Invoices & payments"
          title="Pay what you owe, once"
          body="Invoices are matched, approved and paid inside the same case as the order they belong to. Duplicate supplier invoice numbers are refused, over-billing is caught cumulatively, and a paid invoice cannot be paid again."
          points={[
            "Three-way match with tolerances you set",
            "AP ageing, due dates derived from your payment terms",
            "Bulk payment runs where you choose each invoice yourself",
            "Budget commitment tracked from the order, not from the invoice",
          ]}
          image="/images/marketing/finance.jpg"
          alt="Someone working through invoices and paperwork at a desk"
          flip
        />

        <FeatureBlock
          id="delivery"
          eyebrow="Delivery & close-out"
          title="Service delivery is part of the case, not a separate story"
          body="Where the purchase is work rather than stock, the same case carries the schedule, the confirmation and the sign-off — so what was delivered to the client and what was paid for the work sit in one record."
          points={[
            "Scheduled and confirmed delivery, with who signed",
            "Documents — order, contract, invoice — as real PDFs, not screens",
            "The full timeline exports for an audit or a board paper",
            "Nothing closes with a stage still open behind it",
          ]}
          image="/images/marketing/delivery.jpg"
          alt="A site worker in a hard hat and high-visibility vest"
        />
      </section>

      {/* ------------------------------------------------------ pricing -- */}
      <section id="pricing" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <SectionHeading
            eyebrow="Pricing"
            title={`From ${priceLabel(plans[0])} a month`}
            lead={`Three plans, priced per organisation rather than per seat band you have to guess at. ${TRIAL_DAYS} days free to start, and a one-off onboarding fee quoted with whichever plan you take.`}
          />
          <div className="mt-10">
            <PricingTable plans={plans} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- FAQ -- */}
      <section id="faq" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <SectionHeading eyebrow="Questions" title="What buyers ask us first" />
        <div className="mt-8">
          <FaqList faqs={FAQS} />
        </div>
      </section>

      {/* ---------------------------------------------------------- CTA -- */}
      <section className="mk-dark relative overflow-hidden">
        <div className="mk-grid-lines absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <ShieldCheck className="mx-auto h-8 w-8 text-accent" aria-hidden="true" />
          <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Every request. Every approval. Every shilling.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Start a workspace, raise a real requisition, and see the whole cycle run
            end to end before you pay anything.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-[0.9375rem] font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-white hover:text-brand-darker"
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-white/25 px-6 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10"
            >
              Talk to our team
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
