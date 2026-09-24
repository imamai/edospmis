"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { signUp, type SignUpState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { TextInput } from "@/components/ui/field";

const initial: SignUpState = { error: null };

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, initial);

  if (state.checkEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <Card className="max-w-sm">
          <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-good" />
            <h1 className="text-lg font-semibold text-ink">Check your email</h1>
            <p className="text-sm text-ink-faint">
              Confirm your address to finish setting up your workspace, then sign in.
            </p>
            <Link href="/login" className="mt-2 text-sm font-medium text-brand hover:underline">
              Go to sign in
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-brand">EDOSPMIS</h1>
          <p className="mt-1 text-sm text-ink-faint">Create your organization&apos;s workspace</p>
        </div>
        <Card>
          <CardBody>
            <form action={action} className="flex flex-col gap-4">
              <TextInput label="Organization name" name="tenant_name" required placeholder="e.g. EDOS Centre" />
              <TextInput label="Your full name" name="full_name" required />
              <TextInput label="Email" name="email" type="email" autoComplete="email" required />
              <TextInput
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                hint="At least 8 characters"
              />
              {state.error && (
                <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
                  {state.error}
                </p>
              )}
              <Button type="submit" busy={pending} className="w-full">
                {pending ? "Creating workspace" : "Create workspace"}
              </Button>
            </form>
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-sm text-ink-faint">
          Already have a workspace?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
