import explicitTypes from "eslint-plugin-explicit-types";
import importStructure from "eslint-plugin-import-structure";
import litRobust from "eslint-plugin-lit-robust";
import { defineConfig } from "vite-plus";

import { decorators } from "./scripts/decorators.ts";
import { projectLint, projectOverrides } from "./scripts/project-lint.ts";

export default defineConfig({
  plugins: [decorators()],
  build: {
    // Rust serves `dist`, whose committed files must survive a build.
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    modulePreload: false,
    rolldownOptions: {
      input: { bundle: "src/index.ts" },
      output: { entryFileNames: "js/[name].js" },
    },
    // One bundle on purpose: index.html loads `js/bundle.js` alone.
    chunkSizeWarningLimit: 1024,
  },
  // The frontend has no Vitest tests yet; CI still runs `vp test`.
  test: { passWithNoTests: true },
  fmt: {
    printWidth: 80,
    quoteProps: "preserve",
    embeddedLanguageFormatting: "off",
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import"],
    jsPlugins: [
      "eslint-plugin-explicit-types",
      "eslint-plugin-import-structure",
      "eslint-plugin-lit-robust",
      "./scripts/project-lint.ts",
    ],
    categories: {
      correctness: "error",
      suspicious: "error",
      pedantic: "error",
      perf: "error",
      style: "error",
      restriction: "error",
    },
    rules: {
      ...explicitTypes.configs.all.rules,
      ...importStructure.configs.all.rules,
      ...litRobust.configs.all.rules,
      ...projectLint.configs.project.rules,
    },
    overrides: projectOverrides,
    options: {
      typeAware: true,
      typeCheck: true,
      maxWarnings: 0,
      reportUnusedDisableDirectives: "error",
    },
  },
});
