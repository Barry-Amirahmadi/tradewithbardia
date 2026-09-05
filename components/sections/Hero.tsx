import HeroScene from "./HeroScene";
import SceneDisclosure from "@/components/charts/SceneDisclosure";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionary-type";
import { heroScene } from "@/lib/viz/scenes/hero-scene";
import StaticTradingAnimation from "@/lib/viz/static-renderer";

/**
 * Server half of the hero — master prompt §14, §19.
 *
 * Its whole job is to render the static diagram on the server and hand it to
 * the client component as children. That keeps the SVG out of the client
 * bundle entirely while still giving the interactive shell something real to
 * start from, which is the server/client split §14 asks for rather than
 * marking the whole section `"use client"` and shipping both renderers.
 */
export default function Hero({
  locale,
  direction,
  dictionary,
}: {
  locale: Locale;
  direction: "ltr" | "rtl";
  dictionary: Dictionary;
}) {
  return (
    <HeroScene
      locale={locale}
      direction={direction}
      hero={dictionary.hero}
      cta={dictionary.nav.cta}
      // Rendered here, on the server, and passed down. The hero does not get
      // to decide whether a disclosure appears — the scene's provenance does.
      disclosure={
        <SceneDisclosure
          scene={heroScene}
          labels={dictionary.viz.disclosures}
        />
      }
    >
      <StaticTradingAnimation
        scene={heroScene}
        // Resolved at 1: the fallback should be the finished diagram, not a
        // frozen first frame of an animation the visitor cannot play.
        progress={1}
        direction={direction}
        description={dictionary.hero.sceneDescription}
        className="h-full w-full"
      />
    </HeroScene>
  );
}
