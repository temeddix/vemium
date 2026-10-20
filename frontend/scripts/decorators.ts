/**
 * `decorators` - a Vite plugin that lowers the source's standard (TC39)
 * decorators, `accessor` fields included, through esbuild.
 *
 * Vite transforms TypeScript with Oxc, which strips types but cannot lower
 * standard decorators yet, and no browser runs them natively. This plugin
 * runs first (`enforce: "pre"`) on every `.ts` module that could hold one,
 * and hands the rest of the pipeline plain ES2022. Being a Vite plugin, it
 * covers `vp build`, `vp dev`, and `vp test` alike. Drop it once Oxc lowers
 * standard decorators itself.
 *
 * @module
 */

import { transform } from "esbuild";
import type { Plugin } from "vite-plus";

/** A TypeScript module path, with any Vite query suffix left off. */
const TS_MODULE_PATTERN: RegExp = /\.ts(?:\?|$)/u;

/** What the transform hook hands back: lowered code and its source map. */
interface LoweredModule {
  code: string;
  map: string;
}

/** Lowers one module, or leaves it alone when it cannot hold a decorator. */
async function lowerDecorators(
  code: string,
  id: string,
): Promise<LoweredModule | null> {
  if (!TS_MODULE_PATTERN.test(id) || !code.includes("@")) {
    return null;
  }
  const result = await transform(code, {
    loader: "ts",
    target: "es2022",
    sourcemap: true,
    sourcefile: id,
  });
  return { code: result.code, map: result.map };
}

/** The plugin, for `plugins` in `vite.config.ts`. */
export function decorators(): Plugin {
  return {
    name: "decorators",
    enforce: "pre",
    transform: lowerDecorators,
  };
}
