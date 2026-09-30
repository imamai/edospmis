import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { enabledProviders } from "@/lib/auth/providers";
import { Spinner } from "@/components/ui/spinner";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // Asked for on the server so a provider that is not switched on in Supabase
  // never renders a button — see lib/auth/providers.ts.
  const providers = await enabledProviders();

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
        Welcome back
      </h1>
      <p className="mt-1.5 text-sm text-ink-soft">
        Sign in to see what is waiting on you.
      </p>

      <div className="mt-7">
        <Suspense
          fallback={
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-brand" />
            </div>
          }
        >
          <LoginForm providers={providers} />
        </Suspense>
      </div>

      <p className="mt-6 text-sm text-ink-soft">
        New organisation?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create a workspace
        </Link>{" "}
        <span className="text-ink-faint">— {TRIAL_DAYS} days free</span>
      </p>
    </div>
  );
}
