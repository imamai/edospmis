"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type SignInState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { TextInput } from "@/components/ui/field";

const initial: SignInState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-brand">EDOSPMIS</h1>
          <p className="mt-1 text-sm text-ink-faint">Sign in to your workspace</p>
        </div>
        <Card>
          <CardBody>
            <form action={action} className="flex flex-col gap-4">
              <TextInput label="Email" name="email" type="email" autoComplete="email" required />
              <TextInput label="Password" name="password" type="password" autoComplete="current-password" required />
              {state.error && (
                <p role="alert" className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-sm text-critical">
                  {state.error}
                </p>
              )}
              <Button type="submit" busy={pending} className="w-full">
                {pending ? "Signing in" : "Sign in"}
              </Button>
            </form>
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-sm text-ink-faint">
          New organization?{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
