import type { Dictionary } from "@/lib/i18n/dictionary-type";

const steps = [
  "context",
  "liquidity",
  "structure",
  "setup",
  "execution",
  "review",
  "data",
] as const;

/**
 * The loop — master prompt §22.
 *
 * A pure server component: no motion, no client JavaScript, no measurement.
 * Its job is credibility through process, and process reads better as
 * crawlable prose than as an animation (§62). It also gives the page enough
 * scroll depth for the navbar's SCROLLED and HIDDEN states to be reachable.
 */
export default function Process({
  dictionary,
}: {
  dictionary: Dictionary;
}) {
  const { process } = dictionary;

  return (
    <section className="border-t border-subtle bg-surface py-[var(--space-32)]">
      <div className="container-page">
        <p className="type-label">{process.eyebrow}</p>
        <h2 className="mt-4 max-w-[20ch] type-h2">
          {process.title}
        </h2>
        <p className="mt-6 max-w-[var(--container-text)] type-lead">
          {process.lead}
        </p>

        <ol className="mt-[var(--space-16)] grid list-none gap-px border border-subtle bg-subtle p-0 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((key, index) => {
            const step = process.steps[key];
            return (
              <li
                key={key}
                className="flex flex-col gap-3 bg-surface p-[var(--space-6)]"
              >
                <span className="type-label numeric text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="type-h3">
                  {step.label}
                </h3>
                <p className="type-caption">
                  {step.body}
                </p>
              </li>
            );
          })}

          {/* The loop closes: the last cell points back at the first. Drawn as
              a cell rather than an arrow so it survives both directions and
              every breakpoint without a mirrored asset. */}
          <li className="flex items-center justify-center bg-surface p-[var(--space-6)]">
            <span className="type-label text-accent">
              ↻ {process.steps.context.label}
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
}
