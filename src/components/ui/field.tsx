"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-[0.9375rem] text-ink " +
  "placeholder:text-ink-faint focus:border-brand focus:outline-none " +
  "disabled:bg-surface-sunk disabled:text-ink-faint";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-critical">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-critical">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  hint,
  error,
  required,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "h-11", error && "border-critical")}
        {...props}
      />
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  required,
  className,
  id,
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <textarea
        id={fieldId}
        required={required}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "py-2.5", error && "border-critical")}
        {...props}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  hint,
  error,
  required,
  className,
  id,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string | null;
}) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <select
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, "h-11", error && "border-critical")}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

export function CheckboxRow({
  label,
  description,
  id,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-brand/50",
        className,
      )}
    >
      <input
        id={fieldId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong text-brand focus:ring-brand-mid"
        {...props}
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-faint">{description}</span>}
      </span>
    </label>
  );
}
