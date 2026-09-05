import {
  requiresDisclosure,
  type DisclosingProvenance,
  type TradingScene,
} from "@/lib/viz/types";

/**
 * Provenance disclosure — master prompt §26, §77.1, §77.13.
 *
 * The rule "never present fabricated data as real" is only as good as its
 * weakest instance. Previously the hero pasted its own disclaimer into JSX,
 * which meant the next chart — a Setup Lab card, a replay, an Academy figure —
 * would ship without one unless somebody remembered.
 *
 * Here the scene decides. Anything that is not `verified` renders a
 * disclosure, and `labels` is typed as a total record over the disclosing
 * states, so a new provenance cannot be added without copy in every language.
 * Reusable unchanged by RealChart, FrameSequence, VideoSequence and WebGL.
 *
 * A server component: disclosure is content, and content should not depend on
 * hydration to appear.
 */
export default function SceneDisclosure({
  scene,
  labels,
  className,
}: {
  scene: TradingScene;
  labels: Record<DisclosingProvenance, string>;
  className?: string;
}) {
  if (!requiresDisclosure(scene.provenance)) return null;

  return (
    <p
      data-provenance={scene.provenance}
      className={
        className ?? "text-[length:var(--text-micro)] text-secondary"
      }
    >
      {labels[scene.provenance]}
    </p>
  );
}
