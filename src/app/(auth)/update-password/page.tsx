import type { Metadata } from "next";
import { Suspense } from "react";
import { UpdatePasswordForm } from "./update-password-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = {
  title: "Choose a password",
  robots: { index: false, follow: false },
};

/**
 * Two journeys land here, both already signed in by /auth/callback: an
 * invited teammate setting their first password, and somebody who asked to
 * reset a forgotten one. The heading follows whichever it is; everything
 * below it is the same job.
 */
export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-10">
          <Spinner className="h-6 w-6 text-brand" />
        </div>
      }
    >
      <UpdatePasswordForm />
    </Suspense>
  );
}
