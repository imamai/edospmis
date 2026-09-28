import Image from "next/image";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "center",
  tone = "light",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "center" | "left";
  tone?: "light" | "dark";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <p
          className={cn(
            "text-xs font-semibold tracking-[0.14em] uppercase",
            tone === "dark" ? "text-accent" : "text-brand",
          )}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          "mt-2.5 font-display text-2xl font-extrabold tracking-tight sm:text-3xl",
          tone === "dark" ? "text-white" : "text-ink",
        )}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "mt-3 text-base leading-relaxed",
            tone === "dark" ? "text-white/70" : "text-ink-soft",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/**
 * Alternating photo/copy block used for each capability area. `flip` puts the
 * photograph on the left; on phones the image always leads so the section is
 * recognisable before any reading happens.
 */
export function FeatureBlock({
  id,
  eyebrow,
  title,
  body,
  points,
  image,
  alt,
  flip = false,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  image: string;
  alt: string;
  flip?: boolean;
}) {
  return (
    <div id={id} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={cn("relative", flip && "lg:order-2")}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line shadow-raised">
          <Image
            src={image}
            alt={alt}
            fill
            sizes="(max-width: 1024px) 100vw, 520px"
            className="object-cover"
          />
        </div>
      </div>

      <div className={cn(flip && "lg:order-1")}>
        <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">{eyebrow}</p>
        <h3 className="mt-2.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">
          {title}
        </h3>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
        <ul className="mt-5 flex flex-col gap-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-ink">
              <span
                className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                aria-hidden="true"
              />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
