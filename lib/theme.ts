export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "twb.theme";

export const themeChoices: readonly ThemeChoice[] = ["system", "light", "dark"];

/**
 * Runs before first paint, inlined into <head>.
 *
 * Without it the document renders with the default `color-scheme` for one
 * frame and a visitor who chose light gets a black flash on every navigation.
 * It is deliberately tiny and dependency-free: it is parse-blocking, so its
 * cost is paid on every page load (§60).
 *
 * "system" writes no attribute at all, which lets the `color-scheme: dark
 * light` declaration in globals.css follow the OS preference on its own.
 */
export const themeInitScript = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(v==="light"||v==="dark"){document.documentElement.setAttribute("data-theme",v)}}catch(e){}})()`;

export function readStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    // Private browsing modes throw on localStorage access. A theme preference
    // is not worth breaking the page over.
    return "system";
  }
}

/** Fired on the same tab, where a `storage` event never arrives. */
const THEME_EVENT = "twb:themechange";

/**
 * The single place `data-theme` is written. Everything that can change the
 * preference routes through here, so the attribute cannot drift from storage.
 *
 * Idempotent by construction: it derives the attribute from stored state
 * rather than from an argument, so replaying it is always safe.
 */
function syncDocumentTheme(): void {
  const root = document.documentElement;
  const choice = readStoredTheme();
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
}

/**
 * Subscription half of a `useSyncExternalStore` pair. Reading localStorage in
 * an effect and calling setState is a cascading render; modelling the stored
 * preference as what it actually is — an external store with a different
 * server snapshot — is the correct shape.
 *
 * The handler applies the document attribute BEFORE notifying React. A
 * subscription that only notified would re-render the toggle's glyph while
 * leaving the page on the old theme, so the icon and the page would disagree —
 * which is exactly what the 2026-09-05 audit caught. The DOM is part of this
 * store's state, not a side effect of the component that happens to own the
 * button.
 */
export function subscribeTheme(onChange: () => void): () => void {
  const handler = () => {
    syncDocumentTheme();
    onChange();
  };

  // `storage` fires only in OTHER tabs; THEME_EVENT covers this one.
  window.addEventListener("storage", handler);
  window.addEventListener(THEME_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(THEME_EVENT, handler);
  };
}

/** The server has no preference to read; it always renders the system value. */
export function serverTheme(): ThemeChoice {
  return "system";
}

/**
 * Storage is written first, then the document is synced from it, then
 * listeners are notified. That order matters: `syncDocumentTheme` reads
 * storage, so writing second would apply the previous value.
 */
export function applyTheme(choice: ThemeChoice): void {
  try {
    if (choice === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {
    // Private browsing throws. Fall back to applying the choice to this
    // document only, so the click still does something visible.
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    window.dispatchEvent(new Event(THEME_EVENT));
    return;
  }

  syncDocumentTheme();
  window.dispatchEvent(new Event(THEME_EVENT));
}
