import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Create your workspace",
  description: `Start a ${TRIAL_DAYS}-day free trial of EDOSPMIS and run your first requisition through approval, order, receipt and payment.`,
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Start with your first request
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        {TRIAL_DAYS} days free. No card, no commitment.
      </p>

      <div className="mt-7">
        <SignupForm />
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        Already have a workspace?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
