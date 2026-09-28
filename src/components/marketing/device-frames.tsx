import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Frames for the product showcase.
 *
 * The screenshots inside are genuine captures of the running application
 * against the demonstration workspace — not drawn mockups — so what a visitor
 * sees here is what the product actually looks like. The bezels are CSS
 * rather than images so they stay crisp at any size and cost nothing to
 * download.
 *
 * Every frame's aspect ratio matches the viewport its screenshot was taken
 * at — 1440x900 for the desktop captures, 390x844 for the phone ones — so
 * `object-cover` never actually crops anything. A frame whose ratio drifts
 * from its capture is the one thing that makes a real screenshot look fake.
 */

export function PhoneFrame({
  src,
  alt,
  caption,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure className={cn("flex flex-col items-center", className)}>
      {/* No notch or island: a cutout would sit over the app's own header and
          read as a rendering fault rather than as a phone. The bezel and
          corner radius carry it. */}
      <div className="relative w-full max-w-[15rem] rounded-[2.25rem] border-[0.6rem] border-ink bg-ink shadow-raised ring-1 ring-black/10">
        <div className="relative aspect-[390/844] overflow-hidden rounded-[1.7rem] bg-canvas">
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes="(max-width: 640px) 60vw, 240px"
            className="object-cover object-top"
          />
        </div>
      </div>

      {caption && (
        <figcaption className="mt-3 max-w-[15rem] text-center text-xs leading-relaxed text-ink-soft">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function LaptopFrame({
  src,
  alt,
  caption,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure className={cn("flex w-full flex-col items-center", className)}>
      <div className="w-full">
        {/* Lid */}
        <div className="relative rounded-t-xl border-[0.55rem] border-b-0 border-ink bg-ink shadow-raised">
          <div className="relative aspect-[1440/900] overflow-hidden rounded-t-[0.35rem] bg-canvas">
            <Image
              src={src}
              alt={alt}
              fill
              priority={priority}
              sizes="(max-width: 1024px) 100vw, 680px"
              className="object-cover object-top"
            />
          </div>
        </div>

        {/* Base — the slight overhang and notch are what read as "laptop". */}
        <div className="relative mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-xl bg-ink shadow-lg">
          <span
            className="absolute top-0 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-b-md bg-white/15"
            aria-hidden="true"
          />
        </div>
      </div>

      {caption && (
        <figcaption className="mt-4 max-w-md text-center text-xs leading-relaxed text-ink-soft">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * A plain browser window, for the screens that sit beside the hero capture.
 * Lighter than the laptop so two of them in a row do not compete with it.
 */
export function BrowserFrame({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={cn("flex w-full flex-col", className)}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface-sunk px-3">
          {["bg-line-strong", "bg-line-strong", "bg-line-strong"].map((c, i) => (
            <span key={i} className={cn("h-2 w-2 rounded-full", c)} aria-hidden="true" />
          ))}
        </div>
        <div className="relative aspect-[1440/900] bg-canvas">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 480px"
            className="object-cover object-top"
          />
        </div>
      </div>

      {caption && (
        <figcaption className="mt-3 text-sm leading-relaxed text-ink-soft">{caption}</figcaption>
      )}
    </figure>
  );
}
