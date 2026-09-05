import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * Resolver hook for the test runner.
 *
 * The application is bundled by Turbopack, which resolves extensionless
 * relative imports (`./types`) and the `@/` alias. Node's ESM resolver does
 * neither, so a test importing a module with a *value* import would fail with
 * ERR_MODULE_NOT_FOUND before a single assertion ran.
 *
 * Twenty lines here keeps the test layer at zero dependencies and, more
 * importantly, keeps the source unchanged — tests should adapt to the
 * production code, not the other way round.
 */
const projectRoot = new URL("../", import.meta.url);
const extensions = [".ts", ".tsx", "/index.ts", ".js", ".json"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;

    if (specifier.startsWith("@/")) {
      base = new URL(specifier.slice(2), projectRoot);
    } else if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
      base = new URL(specifier, context.parentURL);
    }

    if (base !== null) {
      if (existsSync(fileURLToPath(base))) {
        return nextResolve(base.href, context);
      }
      for (const extension of extensions) {
        const candidate = new URL(base.href + extension);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
