import type { Setup } from "@/lib/trading/setups";

/**
 * THE CARD GLYPH — master prompt §2, §7.
 *
 * Deliberately not a chart, and deliberately not the visualization façade.
 *
 * The hero's server-rendered SVG fallback is 23.4 kB for one scene. Rendering
 * that per card would put roughly 470 kB of markup into a twenty-setup library
 * — four times the entire current document — for pictures too small to read.
 * §2 rules it out and §7 asks for "lightweight visual placeholders" instead.
 *
 * So a card gets a glyph: the setup's own shape descriptor as a single
 * polyline, around 200 bytes. It is not readable as price and does not pretend
 * to be. What it does is make one setup distinguishable from another at a
 * glance, which is the actual job of a card preview.
 *
 * A server component with no measurement, no lifecycle and no client cost.
 * Full-fidelity visualization is the detail page's replay, mounted once.
 */
export default function SetupPreview({ setup }: { setup: Setup }) {
  const points = setup.preview
    .map(([x, y]) => `${(x * 100).toFixed(1)},${(y * 40).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="setup-preview"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
