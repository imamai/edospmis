import { ONBOARDING_NOTE, TRIAL_DAYS } from "@/lib/plans";
import type { Faq } from "@/components/marketing/faq-list";

/**
 * The questions a buyer asks before they sign up, answered once.
 *
 * Kept beside the plans rather than in the page so the landing page and the
 * pricing page cannot answer the same question two different ways — and so
 * the onboarding fee is described in exactly the words the price list uses.
 */
export const FAQS: Faq[] = [
  {
    question: "What does the one-off onboarding fee cover?",
    answer: ONBOARDING_NOTE,
  },
  {
    question: "Can we try it before paying anything?",
    answer: `Yes. Every workspace starts with ${TRIAL_DAYS} days free and no card. Raise real requisitions, run a real approval, receive real goods — if it does not fit how you buy, walk away owing nothing.`,
  },
  {
    question: "Does it work for a county, a school or an NGO, or only a company?",
    answer:
      "Any organisation that has to justify a purchase. The approval chain, the thresholds and the stages are yours to configure, so a three-person office and a five-department authority matrix both fit without a different product.",
  },
  {
    question: "What stops the same invoice being paid twice?",
    answer:
      "An invoice is matched against its order and its goods received note before it can be approved, cumulatively across part-billing — so a second invoice for units already billed is refused rather than warned about. Supplier invoice numbers are unique per supplier, and a payment cannot be recorded against an invoice that is already paid.",
  },
  {
    question: "Can an invoice arrive before the goods?",
    answer:
      "It can arrive, but it cannot be entered against an order with nothing received: the system refuses to invoice ahead of a goods received note. Where goods genuinely precede paperwork, record the receipt first — which is the order the control is there to enforce.",
  },
  {
    question: "Who can see what?",
    answer:
      "Roles and permissions are enforced in the database, not in the interface. A requester sees their own cases; an approver sees what is waiting on them; only finance roles see payment detail. A link to a document somebody is not entitled to open does not render for them at all.",
  },
  {
    question: "Can we get our data out?",
    answer:
      "At any time, and without asking us. Every register and report exports to PDF, Excel or CSV, and purchase orders, contracts and invoices each render as a real document you can print or file.",
  },
  {
    question: "How do we pay?",
    answer:
      "Monthly, by M-Pesa or bank transfer, against an invoice from EDOS Centre. The onboarding fee is quoted and invoiced separately, once, before the work starts.",
  },
];
