/**
 * `lit-check` - runs lit-analyzer over `src` in strict mode, with an
 * unknown tag name as an error.
 *
 * lit-analyzer drives the TypeScript compiler API, which TypeScript 7 no
 * longer ships. A resolve hook therefore points every `typescript` import at
 * the `typescript-6` devDependency (`npm:typescript@^6`) before the analyzer
 * loads, so the rest of the toolchain stays on TypeScript 7.
 *
 * @module
 */

import {
  registerHooks,
  type ResolveFnOutput,
  type ResolveHookContext,
} from "node:module";
import { argv } from "node:process";

/** The package lit-analyzer asks for, and the alias that answers it. */
const TYPESCRIPT_PACKAGE: string = "typescript";
const TYPESCRIPT_ALIAS: string = "typescript-6";

/** Whether a specifier names the TypeScript package or one of its files. */
function isTypescriptSpecifier(specifier: string): boolean {
  return (
    specifier === TYPESCRIPT_PACKAGE ||
    specifier.startsWith(`${TYPESCRIPT_PACKAGE}/`)
  );
}

/** The `resolve` hook: swaps the package name, then resolves as usual. */
function resolveTypescript(
  specifier: string,
  context: ResolveHookContext,
  nextResolve: (
    specifier: string,
    context?: ResolveHookContext,
  ) => ResolveFnOutput,
): ResolveFnOutput {
  if (isTypescriptSpecifier(specifier)) {
    const aliased =
      TYPESCRIPT_ALIAS + specifier.slice(TYPESCRIPT_PACKAGE.length);
    return nextResolve(aliased, context);
  }
  return nextResolve(specifier, context);
}

registerHooks({ resolve: resolveTypescript });

// The analyzer's CLI reads its arguments from `process.argv` and exits with
// its verdict. It is imported only now, after the hook is in place.
argv.splice(
  2,
  argv.length - 2,
  "src",
  "--strict",
  "--rules.no-unknown-tag-name",
  "error",
);
const { cli } = await import("lit-analyzer");
await cli();
