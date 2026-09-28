import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        We&rsquo;ll email you a link to choose a new one.
      </p>

      <div className="mt-7">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
