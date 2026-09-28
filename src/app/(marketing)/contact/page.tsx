import Link from "next/link";
import type { Metadata } from "next";
import { Mail, MapPin, MessageSquare } from "lucide-react";
import { SectionHeading } from "@/components/marketing/sections";
import { ONBOARDING_NOTE, TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Talk to EDOS Centre about EDOSPMIS — a walkthrough of your own procurement cycle, an onboarding quote, or a question before you start your trial.",
  alternates: { canonical: "/contact" },
};

/**
 * Deliberately not a form.
 *
 * A contact form needs somewhere to put the message and somebody watching
 * that place; an address that is already monitored needs neither, and cannot
 * silently drop an enquiry the way an unwatched table can.
 */
export default function ContactPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:py-20">
      <SectionHeading
        eyebrow="Contact"
        title="Talk to the people who built it"
        lead="A walkthrough against your own approval thresholds, an onboarding quote, or a straight answer about whether this fits how you buy."
      />

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <a
          href="mailto:info@edoscentre.co.ke?subject=EDOSPMIS%20enquiry"
          className="mk-lift flex flex-col rounded-xl border border-line bg-surface p-6 shadow-card"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Mail className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-base font-bold text-ink">Email us</h3>
          <p className="mt-1.5 text-sm text-ink-soft">info@edoscentre.co.ke</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Tell us roughly how many requests a month you handle and who approves
            them — that is enough for us to answer usefully.
          </p>
        </a>

        <div className="flex flex-col rounded-xl border border-line bg-surface p-6 shadow-card">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <MapPin className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-base font-bold text-ink">EDOS Centre</h3>
          <p className="mt-1.5 text-sm text-ink-soft">Nairobi, Kenya</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Built here, for organisations that answer to a board, a county
            assembly, a donor or an auditor.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-accent/25 bg-accent-soft px-5 py-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">About onboarding.</span> {ONBOARDING_NOTE}
          </p>
        </div>
      </div>

      <p className="mt-8 text-center text-sm text-ink-soft">
        You do not have to talk to anyone first.{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Start your {TRIAL_DAYS} days
        </Link>{" "}
        and look around on your own.
      </p>
    </section>
  );
}
