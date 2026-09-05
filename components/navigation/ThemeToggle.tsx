"use client";

import { useSyncExternalStore } from "react";

import {
  applyTheme,
  readStoredTheme,
  serverTheme,
  subscribeTheme,
  type ThemeChoice,
} from "@/lib/theme";

const order: readonly ThemeChoice[] = ["system", "light", "dark"];

const glyph: Record<ThemeChoice, string> = {
  system: "◐",
  light: "○",
  dark: "●",
};

interface Props {
  label: string;
  names: Record<ThemeChoice, string>;
}

export default function ThemeToggle({ label, names }: Props) {
  // The stored preference is external state with a different server snapshot,
  // so it is read through useSyncExternalStore rather than an effect that
  // calls setState on mount. React handles the server/client difference
  // without a hydration mismatch, and no "mounted" flag is needed.
  const choice = useSyncExternalStore(
    subscribeTheme,
    readStoredTheme,
    serverTheme,
  );

  const next = order[(order.indexOf(choice) + 1) % order.length] ?? "system";

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      className="btn btn-ghost btn-icon"
      aria-label={`${label} — ${names[next]}`}
      title={names[choice]}
    >
      <span aria-hidden="true" className="text-[0.9rem] leading-none">
        {glyph[choice]}
      </span>
    </button>
  );
}
