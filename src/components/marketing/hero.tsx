import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, FileCheck2, Landmark, ShieldCheck, Timer } from "lucide-react";
import { CountUp } from "./count-up";
import { TRIAL_DAYS } from "@/lib/plans";

/**
 * Full-bleed photographic hero.
 *
 * The photograph carries the page rather than sitting in a card beside it:
 * the subject is the work itself — a stores aisle, a signed file changing
 * hands, an agreement closed — so a visitor knows what this is for before
 * reading a word. Three images cross-fade slowly behind a layered scrim, and
 * the headline arrives in sequence: enough motion to feel alive, none of it
 * fast enough to compete with reading.
 *
 * They carry no alt text because they are decorative: the headline sitting
 * over them already tells a screen reader what this page is.
 */
const SLIDES = [
  "/images/marketing/hero-stores.jpg",
  "/images/marketing/hero-approval.jpg",
  "/images/marketing/hero-award.jpg",
];

/** Splits a line into words so each can rise in on its own beat. */
function Words({ text, start = 0 }: { text: string; start?: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        // The space belongs BETWEEN the spans, not inside one: `.word-rise`
        // is an inline-block, and a trailing space inside it is trimmed —
        // which runs the whole headline together into one word.
        <span key={`${word}-${i}`}>
          {i > 0 ? " " : ""}
          <span className="word-rise" style={{ animationDelay: `${start + i * 70}ms` }}>
            {word}
          </span>
        </span>
      ))}
    </>
  );
}

function Metric({
  icon,
  children,
  label,
  delay,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  label: string;
  delay: number;
}) {
  return (
    <div
      className="rise mk-glass flex items-center gap-3 rounded-xl px-4 py-3 text-left"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-lg leading-none font-bold text-white tnum">{children}</p>
        <p className="mt-1 text-[0.6875rem] whitespace-nowrap text-white/70">{label}</p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    // -mt-16/pt-16 pulls the photograph up behind the fixed header, so the
    // image is genuinely full-bleed rather than starting below a bar.
    <section className="relative isolate -mt-16 flex min-h-[38rem] flex-col justify-center overflow-hidden pt-16 lg:min-h-[44rem]">
      {/* Four panels for three photographs: the first is repeated at the end
          so the loop back to the start cuts between identical frames.

          Each panel clips its own overflow, which is load-bearing: hero-drift
          scales the photograph past 1.0, and an unclipped panel lets that
          overflow paint across its neighbour. */}
      <div className="absolute inset-0 -z-20 overflow-hidden" aria-hidden="true">
        <div className="hero-track flex h-full">
          {[...SLIDES, SLIDES[0]].map((src, i) => (
            <div key={`${src}-${i}`} className="relative h-full w-1/4 shrink-0 overflow-hidden">
              <Image
                src={src}
                alt=""
                fill
                priority={i === 0}
                sizes="100vw"
                className="hero-drift object-cover object-center"
                style={{ animationDelay: `${i * 3}s` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Two scrims rather than one: a vertical gradient anchors the type and
          fades the section into the page, and a flat wash guarantees contrast
          across the bright centre of the photograph. */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-darker/88 via-brand-darker/55 to-brand-darker/92"
        aria-hidden="true"
      />
      <div className="absolute inset-0 -z-10 bg-brand-darker/15 mix-blend-multiply" aria-hidden="true" />
      <div className="mk-grid-lines absolute inset-0 -z-10 opacity-25" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-4xl px-4 py-20 text-center sm:px-6 lg:py-28">
        <span className="rise mk-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-[0.1em] text-accent uppercase">
          <ShieldCheck className="h-3.5 w-3.5" />
          Procure to pay, under control
        </span>

        <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.75rem]">
          <Words text="Know where every request" start={120} />
          <br className="hidden sm:block" />{" "}
          <span className="text-accent">
            <Words text="actually is." start={520} />
          </span>
        </h1>

        <p
          className="rise mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg"
          style={{ animationDelay: "560ms" }}
        >
          EDOSPMIS carries a purchase from the requisition through approval,
          sourcing, award, delivery, inspection, invoice and payment — one
          case, one timeline, one audit trail you can hand to an auditor.
        </p>

        <div
          className="rise mt-9 flex flex-col justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "660ms" }}
        >
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-7 py-3.5 text-[0.9375rem] font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-white hover:text-brand-darker"
          >
            Create your workspace
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/#how-it-works"
            className="mk-glass inline-flex items-center justify-center rounded-lg px-7 py-3.5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/15"
          >
            See how it works
          </Link>
        </div>

        <p className="rise mt-5 text-sm text-white/60" style={{ animationDelay: "740ms" }}>
          {TRIAL_DAYS} days free · No card needed · Onboarding quoted with your plan
        </p>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<FileCheck2 className="h-4 w-4" />} label="Requests this month" delay={820}>
            <CountUp to={412} />
          </Metric>
          <Metric icon={<Timer className="h-4 w-4" />} label="Avg. approval time" delay={900}>
            <CountUp to={1.4} decimals={1} suffix=" days" />
          </Metric>
          <Metric icon={<Landmark className="h-4 w-4" />} label="Committed" delay={980}>
            <CountUp to={18.6} decimals={1} prefix="KES " suffix="M" />
          </Metric>
          <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Matched on first pass" delay={1060}>
            <CountUp to={96} suffix="%" />
          </Metric>
        </div>

        <p className="mt-4 text-[0.6875rem] text-white/40">
          Figures shown are an illustration of an organisation at scale, not a customer&apos;s records.
        </p>
      </div>

      <ChevronDown
        className="absolute bottom-5 left-1/2 h-5 w-5 -translate-x-1/2 text-white/40 motion-safe:animate-bounce"
        aria-hidden="true"
      />
    </section>
  );
}
