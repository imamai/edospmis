import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <Wordmark />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-ink-faint">
          <Link href="/" className="hover:text-brand">
            ← Back to the EDOSPMIS home page
          </Link>
        </p>
      </div>

      {/* Decorative panel — hidden below lg so the form owns the phone screen. */}
      <div className="mk-dark relative hidden overflow-hidden lg:block">
        <Image
          src="/images/marketing/auth-panel.jpg"
          alt=""
          fill
          sizes="50vw"
          className="object-cover opacity-35"
          aria-hidden="true"
        />
        <div className="relative flex h-full flex-col justify-end p-10">
          <blockquote className="max-w-sm">
            <p className="font-display text-2xl leading-snug font-bold text-white">
              &ldquo;The auditor asked who approved it. It took us three days and
              two people to answer.&rdquo;
            </p>
            <footer className="mt-4 text-sm text-white/60">
              The reason this exists
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
