export interface Faq {
  question: string;
  answer: string;
}

/**
 * Native <details> rather than a JS accordion: it is keyboard accessible and
 * searchable by the browser's own find-in-page for free, and every answer is
 * readable with JavaScript disabled.
 */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {faqs.map((faq) => (
        <details
          key={faq.question}
          className="group rounded-xl border border-line bg-surface px-4 py-3.5 open:shadow-card"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.9375rem] font-medium text-ink marker:hidden">
            {faq.question}
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-faint transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
