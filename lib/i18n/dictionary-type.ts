import en from "./dictionaries/en.json";

/**
 * Split out from dictionaries.ts so client components can import the shape
 * without pulling in that module's `server-only` guard. The guard is there to
 * stop the loader reaching the browser; the type has no runtime cost at all.
 */
export type Dictionary = typeof en;
