import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Native flat config. `eslint-config-next` v16 already exports a flat config
 * array, so routing it through the `@eslint/eslintrc` FlatCompat shim — as
 * most templates still do — adds a translation layer that fails on this
 * version rather than doing anything useful.
 */
const config = [
  ...coreWebVitals,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"],
  },
];

export default config;
