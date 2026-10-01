"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "./field";
import { cn } from "@/lib/utils";

/**
 * A password box you can look at.
 *
 * Typing a password you cannot see, twice, on a phone keyboard, is how people
 * end up locked out of an account they just created — and the usual response
 * is to pick something short and memorable, which is worse than the typo it
 * avoids. Showing it is the safer default to offer.
 *
 * Hidden to begin with, because somebody may be setting this up with a
 * colleague beside them. The toggle is a button rather than a checkbox so it
 * never becomes part of the form's data, and it carries a live label so a
 * screen reader announces what pressing it will do.
 */
export function PasswordField({
  label,
  hint,
  error,
  required,
  className,
  id,
  name,
  autoComplete = "new-password",
  autoFocus,
  minLength,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  id?: string;
  name: string;
  autoComplete?: string;
  autoFocus?: boolean;
  minLength?: number;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [shown, setShown] = useState(false);

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={fieldId}
      className={className}
    >
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          type={shown ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          minLength={minLength}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          // Room on the right for the toggle, so a long password never runs
          // underneath it.
          className={cn(
            "h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 pr-11 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
            error && "border-critical",
          )}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          // Describes the action, not the state — "Hide password" is what
          // pressing it does while the password is visible.
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-ink-faint hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
        >
          {shown ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </Field>
  );
}
