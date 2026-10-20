/**
 * `project` - lint rules this frontend holds its own source to that no
 * published plugin or Oxlint built-in carries: `prefer-ascii` (Deno's
 * opt-in rule), `no-disable-comments` and `no-asset-imports` (the
 * explicit-types template), and ports of hugoalh's `no-modifier-private`,
 * `no-duplicate-interfaces`, `no-duplicate-typeofs`, `no-duplicate-types`,
 * `no-empty-yield`, `no-nan`, `no-unsafe-number`, `no-useless-continue`, and
 * `no-useless-type`, copied from eslint-plugin-import-structure's scripts.
 * `no-enum` is `explicit-types/no-enum`; the other hugoalh rules map to
 * Oxlint built-ins in `configs.project`.
 *
 * Loaded by `vite.config.ts` as an Oxlint `jsPlugins` entry, never shipped.
 *
 * @module
 */

import type {
  LanguageOptions,
  Position,
  RuleDefinition,
  RuleTextEdit,
  RuleVisitor,
  TextSourceCode,
} from "@eslint/core";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/types";
import type { DummyRuleMap, OxlintOverride } from "vite-plus/lint";

/** The source code both hosts hand a rule, with its comment list. */
interface ProjectSourceCode extends TextSourceCode {
  text: string;
  getAllComments: () => TSESTree.Comment[];
  getLocFromIndex: (index: number) => Position;
}

/**
 * The type parameters of every rule here, none of which takes options:
 * reports point at TS-ESTree nodes.
 */
interface ProjectRuleTypes {
  LangOptions: LanguageOptions;
  Code: ProjectSourceCode;
  RuleOptions: [];
  Visitor: RuleVisitor;
  Node: TSESTree.Node;
  MessageIds: string;
  ExtRuleDocs: object;
}

/** A repo-local rule without options, in ESLint's standard `create` form. */
type ProjectRule = RuleDefinition<ProjectRuleTypes>;

/** A module specifier read as a path: relative, absolute, or a `#` alias. */
const PATH_SPECIFIER_PATTERN: RegExp = /^[./#]/u;

/** The only extensions an import specifier may end in. */
const MODULE_EXTENSIONS = new Set<string>([".ts", ".js", ".mts", ".mjs"]);

/**
 * Whether `source` names an asset rather than a module: a query string such
 * as `?raw`, or a final path segment whose whole extension is not `.ts`,
 * `.js`, `.mts`, or `.mjs`. Bare package names are left alone, dots and all,
 * as are extensionless paths. Our own files are all `.ts`; the `.js`, `.mts`,
 * and `.mjs` allowance is for package subpaths such as `lit/decorators.js`.
 */
function isAssetSource(source: string): boolean {
  if (source.includes("?")) {
    return true;
  }
  const segments = source.split("/");
  if (!PATH_SPECIFIER_PATTERN.test(source)) {
    const nameLength = source.startsWith("@") ? 2 : 1;
    if (segments.length <= nameLength) {
      return false;
    }
  }
  const lastSegment = segments.at(-1) ?? "";
  const dotIndex = lastSegment.lastIndexOf(".");
  if (lastSegment === "." || lastSegment === ".." || dotIndex === -1) {
    return false;
  }
  return !MODULE_EXTENSIONS.has(lastSegment.slice(dotIndex));
}

/**
 * `no-asset-imports` - allows only `.ts`, `.js`, `.mts`, and `.mjs` modules.
 * It rejects a path ending in any other extension (`.css`, `.json`, `.svg`,
 * `.jsx`, `.tsx`, `.cjs`), a query string (`?raw`, `?url`), and any import or
 * export with import attributes.
 */
const noAssetImportsRule: ProjectRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing assets such as CSS, JSON, or SVG",
    },
    schema: [],
    messages: {
      extension: "Only .ts, .js, .mts and .mjs modules may be imported.",
      attributes: "Import attributes are not allowed.",
    },
  },
  create(context) {
    function checkSource(source: TSESTree.StringLiteral): void {
      if (isAssetSource(source.value)) {
        context.report({ node: source, messageId: "extension" });
      }
    }
    function checkDeclaration(
      node:
        | TSESTree.ImportDeclaration
        | TSESTree.ExportNamedDeclaration
        | TSESTree.ExportAllDeclaration,
    ): void {
      if (node.source === null) {
        return;
      }
      checkSource(node.source);
      if (node.attributes.length > 0) {
        context.report({ node, messageId: "attributes" });
      }
    }
    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression(node: TSESTree.ImportExpression): void {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          typeof node.source.value === "string"
        ) {
          checkSource(node.source);
        }
        if (node.options !== null) {
          context.report({ node, messageId: "attributes" });
        }
      },
    };
  },
};

/** A comment that turns lint rules off or back on, in ESLint or Oxlint form. */
const DIRECTIVE_PATTERN: RegExp = /^\s*(?:eslint|oxlint)-(?:disable|enable)/u;

/** `no-disable-comments`' own name, which a directive may not use to silence it. */
const NO_DISABLE_COMMENTS_NAME: string = "no-disable-comments";

/** The highest code point `prefer-ascii` lets through. */
const MAX_ASCII_CODE_POINT: number = 0x7f;

/** A character `prefer-ascii` rejects, with where it sits in the source. */
interface NonAsciiCharacter {
  character: string;
  /** The code point in hex, four digits at least, as in `U+00E9`. */
  codePoint: string;
  index: number;
}

/** Every non-ASCII character of the text, in order. */
function findNonAscii(text: string): NonAsciiCharacter[] {
  const found: NonAsciiCharacter[] = [];
  let index = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > MAX_ASCII_CODE_POINT) {
      found.push({
        character,
        codePoint: codePoint.toString(16).toUpperCase().padStart(4, "0"),
        index,
      });
    }
    index += character.length;
  }
  return found;
}

/**
 * `prefer-ascii` - every character of the source is ASCII, as Deno's
 * `prefer-ascii` asked.
 */
const preferAsciiRule: ProjectRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Require the source to be ASCII" },
    schema: [],
    messages: {
      nonAscii:
        "Non-ASCII character '{{character}}' (U+{{codePoint}}). Use an escape sequence instead.",
    },
  },
  create(context) {
    return {
      Program(_node: TSESTree.Program): void {
        for (const { character, codePoint, index } of findNonAscii(
          context.sourceCode.text,
        )) {
          const start = context.sourceCode.getLocFromIndex(index);
          const end = context.sourceCode.getLocFromIndex(
            index + character.length,
          );
          context.report({
            loc: { start, end },
            messageId: "nonAscii",
            data: { character, codePoint },
          });
        }
      },
    };
  },
};

/**
 * `no-disable-comments` - rejects every `eslint-disable*`, `eslint-enable*`,
 * `oxlint-disable*`, and `oxlint-enable*` comment, line or block: when a rule
 * fires, fix the source. A directive naming this rule is skipped, so it then
 * silences nothing and fails `reportUnusedDisableDirectives`.
 */
const noDisableCommentsRule: ProjectRule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow lint disable and enable comments" },
    schema: [],
    messages: {
      directive: "Lint disable comments are not allowed; fix the source.",
    },
  },
  create(context) {
    return {
      Program(_node: TSESTree.Program): void {
        for (const comment of context.sourceCode.getAllComments()) {
          if (
            DIRECTIVE_PATTERN.test(comment.value) &&
            !comment.value.includes(NO_DISABLE_COMMENTS_NAME)
          ) {
            context.report({ loc: comment.loc, messageId: "directive" });
          }
        }
      },
    };
  },
};

/**
 * `no-modifier-private` - hugoalh's rule: TypeScript's `private` does not make
 * a member private at run time, so use `#`. A `private constructor` passes.
 * Accessors (`private accessor`) are checked too.
 */
const noModifierPrivateRule: ProjectRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow the private modifier" },
    schema: [],
    messages: {
      modifier:
        "Use of modifier `private` will not actually make it private; Use `#` instead.",
    },
  },
  create(context) {
    return {
      MethodDefinition(node: TSESTree.MethodDefinition): void {
        if (node.kind !== "constructor" && node.accessibility === "private") {
          context.report({ node, messageId: "modifier" });
        }
      },
      PropertyDefinition(node: TSESTree.PropertyDefinition): void {
        if (node.accessibility === "private") {
          context.report({ node, messageId: "modifier" });
        }
      },
      AccessorProperty(node: TSESTree.AccessorProperty): void {
        if (node.accessibility === "private") {
          context.report({ node, messageId: "modifier" });
        }
      },
    };
  },
};

// The other ports of `@hugoalh/deno-lint-rules` 0.8.3 `recommended` rules,
// copied from eslint-plugin-import-structure's scripts with the same behavior.

/** The globals `no-nan` sees through, as in `globalThis.Number.NaN`. */
const GLOBAL_NAMES: ReadonlySet<string> = new Set<string>([
  "globalThis",
  "self",
  "window",
]);

/** A loop statement, whose last `continue` `no-useless-continue` checks. */
type LoopStatement =
  | TSESTree.DoWhileStatement
  | TSESTree.ForInStatement
  | TSESTree.ForOfStatement
  | TSESTree.ForStatement
  | TSESTree.WhileStatement;

/**
 * `no-duplicate-typeofs` - `typeof typeof x` is always `"string"`. Not
 * fixed, since dropping one `typeof` changes the value. hugoalh's
 * `await` and `void` twins are covered by `unicorn/no-unnecessary-await`
 * and `typescript/no-meaningless-void-operator`.
 */
const noDuplicateTypeofsRule: ProjectRule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow `typeof` applied twice in a row" },
    schema: [],
    messages: {
      doubled:
        'Multiple `typeof`s always return `"string"`, possibly not intended.',
    },
  },
  create(context) {
    return {
      UnaryExpression(node: TSESTree.UnaryExpression): void {
        const inner = node.argument;
        if (
          node.operator !== "typeof" ||
          inner.type !== AST_NODE_TYPES.UnaryExpression ||
          inner.operator !== "typeof"
        ) {
          return;
        }
        context.report({
          loc: {
            start: context.sourceCode.getLocFromIndex(node.range[0]),
            end: context.sourceCode.getLocFromIndex(
              node.range[0] + "typeof".length,
            ),
          },
          messageId: "doubled",
        });
      },
    };
  },
};

/** `no-empty-yield` - a `yield` with no expression, likely missing one. */
const noEmptyYieldRule: ProjectRule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow `yield` without an expression" },
    schema: [],
    messages: {
      empty: "Empty `yield` is not allowed, possibly missing the expression.",
    },
  },
  create(context) {
    return {
      YieldExpression(node: TSESTree.YieldExpression): void {
        if (node.argument === null) {
          context.report({ node, messageId: "empty" });
        }
      },
    };
  },
};

/** The name a member expression's property spells, computed or not. */
function propertyName(node: TSESTree.MemberExpression): string | null {
  if (node.property.type === AST_NODE_TYPES.Identifier && !node.computed) {
    return node.property.name;
  }
  if (
    node.property.type === AST_NODE_TYPES.Literal &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return null;
}

/** Whether `node` is a global object, such as `globalThis` or `globalThis.self`. */
function isGlobalChain(node: TSESTree.Expression): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return GLOBAL_NAMES.has(node.name);
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    GLOBAL_NAMES.has(propertyName(node) ?? "") &&
    isGlobalChain(node.object)
  );
}

/**
 * Whether a member expression reads the global `NaN`: `Number.NaN`,
 * `globalThis.NaN`, or `globalThis.Number.NaN`.
 */
function isNanMember(node: TSESTree.MemberExpression): boolean {
  if (propertyName(node) !== "NaN") {
    return false;
  }
  const { object } = node;
  if (object.type === AST_NODE_TYPES.Identifier && object.name === "Number") {
    return true;
  }
  return (
    isGlobalChain(object) ||
    (object.type === AST_NODE_TYPES.MemberExpression &&
      propertyName(object) === "Number" &&
      isGlobalChain(object.object))
  );
}

/** `no-nan` - a `NaN` value is usually an error; test with `Number.isNaN`. */
const noNanRule: ProjectRule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow `NaN` as a value" },
    schema: [],
    messages: {
      nan: "Using `NaN` as a value is usually an error and not intended.",
    },
  },
  create(context) {
    return {
      Identifier(node: TSESTree.Identifier): void {
        if (
          node.name === "NaN" &&
          node.parent.type !== AST_NODE_TYPES.MemberExpression
        ) {
          context.report({ node, messageId: "nan" });
        }
      },
      MemberExpression(node: TSESTree.MemberExpression): void {
        if (isNanMember(node)) {
          context.report({ node, messageId: "nan" });
        }
      },
    };
  },
};

/** `no-unsafe-number` - a number literal outside the safe integer range. */
const noUnsafeNumberRule: ProjectRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow number literals outside the safe integer range",
    },
    schema: [],
    messages: {
      unsafe:
        "Number literals with values equal to 2^53 or greater are too large to be represented accurately.",
    },
  },
  create(context) {
    return {
      Literal(node: TSESTree.Literal): void {
        if (
          typeof node.value === "number" &&
          (node.value < Number.MIN_SAFE_INTEGER ||
            node.value > Number.MAX_SAFE_INTEGER)
        ) {
          context.report({ node, messageId: "unsafe" });
        }
      },
    };
  },
};

/** A loop's trailing `continue`, and whether the fix may remove it. */
interface TrailingContinue {
  statement: TSESTree.ContinueStatement;
  removable: boolean;
}

/**
 * The unlabeled `continue` a loop ends with, and whether removing it is a
 * safe fix: it is in a block, rather than the loop's whole body.
 */
function trailingContinue(node: LoopStatement): TrailingContinue | null {
  if (node.body.type === AST_NODE_TYPES.BlockStatement) {
    const last = node.body.body.at(-1);
    return last?.type === AST_NODE_TYPES.ContinueStatement &&
      last.label === null
      ? { statement: last, removable: true }
      : null;
  }
  if (
    node.body.type === AST_NODE_TYPES.ContinueStatement &&
    node.body.label === null
  ) {
    return { statement: node.body, removable: false };
  }
  return null;
}

/**
 * `no-useless-continue` - an unlabeled `continue` that ends a loop body. A
 * trailing `continue;` in a block is removed by the fix. A loop whose whole
 * body is `continue;` is only reported: hugoalh's fix deleted the loop,
 * header side effects included.
 */
const noUselessContinueRule: ProjectRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow an unlabeled `continue` at the end of a loop",
    },
    fixable: "code",
    schema: [],
    messages: {
      useless:
        "The statement `continue` at the end of the loop and without a label is useless.",
    },
  },
  create(context) {
    function check(node: LoopStatement): void {
      const found = trailingContinue(node);
      if (found !== null) {
        context.report({
          node: found.statement,
          messageId: "useless",
          ...(found.removable
            ? { fix: (fixer): RuleTextEdit => fixer.remove(found.statement) }
            : {}),
        });
      }
    }
    return {
      DoWhileStatement: check,
      ForInStatement: check,
      ForOfStatement: check,
      ForStatement: check,
      WhileStatement: check,
    };
  },
};

/** Node keys that say where a node is, not what it is, in ESLint and Oxlint. */
const POSITION_KEYS: ReadonlySet<string> = new Set<string>([
  "parent",
  "range",
  "loc",
  "start",
  "end",
]);

/** Node types whose member lists mean the same in any order. */
const UNORDERED_TYPES: ReadonlySet<string> = new Set<string>([
  "TSInterfaceBody",
  "TSTypeLiteral",
  "TSUnionType",
  "TSIntersectionType",
]);

/** Type annotations too simple for an alias of their own (`no-useless-type`). */
const SIMPLE_TYPES: ReadonlySet<string> = new Set<string>([
  "TSAnyKeyword",
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSIntrinsicKeyword",
  "TSNeverKeyword",
  "TSNullKeyword",
  "TSNumberKeyword",
  "TSObjectKeyword",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSUndefinedKeyword",
  "TSUnknownKeyword",
  "TSVoidKeyword",
]);

/** Each item serialized, sorted, for `serialize`'s unordered lists. */
function sortedTexts(items: unknown[]): string[] {
  const texts = items.map((item) => serialize(item));
  texts.sort();
  return texts;
}

/**
 * A node's shape as text, without positions, so two declarations compare
 * alike wherever they sit. Members of a type literal, interface body,
 * union, or intersection are sorted, since their order means nothing.
 */
function serialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => serialize(item)).join(",")}]`;
  }
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value) ?? "undefined";
  }
  const unordered = "type" in value && UNORDERED_TYPES.has(String(value.type));
  const parts = Object.entries(value)
    .filter(([key]) => !POSITION_KEYS.has(key))
    .map(([key, child]) => {
      const text =
        unordered && Array.isArray(child)
          ? `[${sortedTexts(child).join(",")}]`
          : serialize(child);
      return `${key}:${text}`;
    });
  return `{${parts.join(",")}}`;
}

/** The top-level declarations in a block, exported or not, that `matches`. */
function declarationsOf<T extends TSESTree.Node>(
  statements: TSESTree.Node[],
  matches: (node: TSESTree.Node) => node is T,
): T[] {
  const found: T[] = [];
  for (const statement of statements) {
    const declaration =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration
        ? statement.declaration
        : statement;
    if (declaration !== null && matches(declaration)) {
      found.push(declaration);
    }
  }
  return found;
}

/** Whether a node is an interface declaration. */
function isInterface(
  node: TSESTree.Node,
): node is TSESTree.TSInterfaceDeclaration {
  return node.type === AST_NODE_TYPES.TSInterfaceDeclaration;
}

/** Whether a node is a type alias declaration. */
function isTypeAlias(
  node: TSESTree.Node,
): node is TSESTree.TSTypeAliasDeclaration {
  return node.type === AST_NODE_TYPES.TSTypeAliasDeclaration;
}

/** Groups nodes by a key and returns the groups with more than one node. */
function duplicateGroups<T>(nodes: T[], keyOf: (node: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const node of nodes) {
    const key = keyOf(node);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [node]);
    } else {
      group.push(node);
    }
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/** What an interface declares, its `extends` list included. */
function interfaceShape(node: TSESTree.TSInterfaceDeclaration): string {
  return `${serialize(node.extends)}&${serialize(node.body)}`;
}

/**
 * `no-duplicate-interfaces` - two interfaces in one block with the same
 * name, which merge silently, or with the same shape, which could be one.
 */
const noDuplicateInterfacesRule: ProjectRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow interfaces with the same name or shape in one block",
    },
    schema: [],
    messages: {
      sameShape:
        "Found multiple interfaces with the same shape, possibly mergeable.",
      sameName:
        "Found multiple interfaces named '{{name}}', possibly not intended.",
    },
  },
  create(context) {
    function check(statements: TSESTree.Node[]): void {
      const nodes = declarationsOf(statements, isInterface);
      for (const node of duplicateGroups(nodes, interfaceShape).flat()) {
        context.report({ node, messageId: "sameShape" });
      }
      for (const node of duplicateGroups(
        nodes,
        (each) => each.id.name,
      ).flat()) {
        context.report({
          node,
          messageId: "sameName",
          data: { name: node.id.name },
        });
      }
    }
    return {
      BlockStatement: (node: TSESTree.BlockStatement): void => {
        check(node.body);
      },
      Program: (node: TSESTree.Program): void => {
        check(node.body);
      },
    };
  },
};

/** `no-duplicate-types` - two type aliases in one block with the same type. */
const noDuplicateTypesRule: ProjectRule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow type aliases with the same type in one block",
    },
    schema: [],
    messages: {
      sameShape:
        "Found multiple types with the same shape, possibly mergeable.",
    },
  },
  create(context) {
    function check(statements: TSESTree.Node[]): void {
      const nodes = declarationsOf(statements, isTypeAlias);
      for (const node of duplicateGroups(nodes, (each) =>
        serialize(each.typeAnnotation),
      ).flat()) {
        context.report({ node, messageId: "sameShape" });
      }
    }
    return {
      BlockStatement: (node: TSESTree.BlockStatement): void => {
        check(node.body);
      },
      Program: (node: TSESTree.Program): void => {
        check(node.body);
      },
    };
  },
};

/** Whether a type is too simple to need an alias: a keyword, literal, or bare name. */
function isSimpleType(node: TSESTree.TypeNode): boolean {
  if (SIMPLE_TYPES.has(node.type)) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.TSLiteralType) {
    return node.literal.type === AST_NODE_TYPES.Literal;
  }
  return (
    node.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeName.type === AST_NODE_TYPES.Identifier &&
    node.typeArguments === undefined
  );
}

/** `no-useless-type` - a type alias for a keyword, literal, or bare type name. */
const noUselessTypeRule: ProjectRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow type aliases too simple to need a name" },
    schema: [],
    messages: { simple: "The type is too simple to need an alias." },
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node: TSESTree.TSTypeAliasDeclaration): void {
        if (isSimpleType(node.typeAnnotation)) {
          context.report({ node, messageId: "simple" });
        }
      },
    };
  },
};

/**
 * This frontend's own rule list, spread by `vite.config.ts` after the plugin
 * configs. Every Oxlint category but `nursery` is on there, so this holds
 * only the `project` rules, option tweaks, and offs, each with its reason.
 */
const rules: DummyRuleMap = {
  // This plugin's own rules, and the explicit-types template's.
  "project/no-asset-imports": "error",
  "project/no-disable-comments": "error",
  "project/no-duplicate-interfaces": "error",
  "project/no-duplicate-typeofs": "error",
  "project/no-duplicate-types": "error",
  "project/no-empty-yield": "error",
  "project/no-modifier-private": "error",
  "project/no-nan": "error",
  "project/no-unsafe-number": "error",
  "project/no-useless-continue": "error",
  "project/no-useless-type": "error",
  "project/prefer-ascii": "error",

  // Option tweaks on rules the categories in `vite.config.ts` turn on.
  // camelCase: no `_` inside a name once leading and trailing ones are
  // trimmed, unless it has no lowercase ASCII letter (UPPER_SNAKE).
  // `properties: true` also checks every object literal key and getter name.
  "id-match": [
    "error",
    "^_*[^_]*_*$|^[^a-z]*$",
    {
      properties: true,
      classFields: false,
      onlyDeclarations: false,
      ignoreDestructuring: true,
    },
  ],
  "one-var": ["error", "never"],
  "no-use-before-define": ["error", { functions: false }],
  "func-style": ["error", "declaration", { allowArrowFunctions: true }],
  // `no-console` alone misses a bare `console` reference.
  "no-restricted-globals": ["error", "window", "console", "Deno"],
  // Packages come from package.json by name, never from a URL or an `npm:`
  // or `jsr:` specifier (Deno's `no-external-import`).
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^(?:https?:|npm:|jsr:)",
          message: "Import packages by name from package.json.",
        },
      ],
    },
  ],
  // A relative import names its `.ts` file.
  "import/extensions": ["error", "always", { ignorePackages: true }],
  "valid-typeof": ["error", { requireStringLiterals: true }],
  "no-inner-declarations": ["error", "both"],
  // Also bans a triple-slash nocheck directive, which Oxlint's
  // `ban-ts-comment` misses. The pedantic default terms stay on.
  "no-warning-comments": [
    "error",
    { terms: ["todo", "fixme", "xxx", "@ts-nocheck"], location: "anywhere" },
  ],
  // A custom element registers itself when its module loads, so a component
  // module or the components barrel is imported for that alone.
  "import/no-unassigned-import": [
    "error",
    {
      allow: [
        "@awesome.me/webawesome/dist/components/**",
        "./*.ts",
        "#web-components",
      ],
    },
  ],
  // Caught errors are named `err`.
  "unicorn/catch-error-name": ["error", { name: "err" }],
  // Size and complexity limits: Deno had none, so `max-lines` takes the
  // apps' 2048 and the rest are each at the smallest limit the code passes.
  "max-lines": [
    "error",
    { max: 2048, skipBlankLines: false, skipComments: false },
  ],
  complexity: ["error", { max: 30 }],
  "max-depth": ["error", { max: 3 }],
  "max-lines-per-function": ["error", { max: 69 }],
  "max-nested-callbacks": ["error", { max: 2 }],
  "max-statements": ["error", { max: 24 }],
  "max-classes-per-file": ["error", { max: 1 }],
  "import/max-dependencies": ["error", { max: 16 }],
  "unicorn/max-nested-calls": ["error", { max: 3 }],
  // Single capital type parameters (`T`, `K`) pass the minimum length.
  "id-length": ["error", { exceptionPatterns: ["^[A-Z]$"] }],
  "max-params": ["error", { max: 4 }],

  // Off, collides with a project rule, a plugin config, or Oxfmt.
  // Collides with `project/no-modifier-private`: no access modifiers.
  "typescript/explicit-member-accessibility": "off",
  // Collides with the house style, which writes no `readonly`.
  "typescript/prefer-readonly": "off",
  // Collides with the house style, which writes no `readonly`.
  "typescript/prefer-readonly-parameter-types": "off",
  // Collides with `explicit-types/no-index-signatures`/`no-utility-types`.
  "typescript/consistent-indexed-object-style": "off",
  // Collides with the explicit annotations the house style writes out.
  "typescript/no-inferrable-types": "off",
  // Collides with `import-structure/enforce-import-order`.
  "sort-imports": "off",
  // Collides with `import-structure/enforce-mod-file` index modules.
  "oxc/no-barrel-file": "off",
  // Collides with exporting each declaration in place.
  "import/group-exports": "off",
  // Collides with exporting each declaration in place, beside its helpers.
  "import/exports-last": "off",
  // Collides with `import/no-default-export`.
  "import/prefer-default-export": "off",
  // Collides with `no-nested-ternary`, which keeps one level allowed.
  "no-ternary": "off",
  // Collides with `require-await` and Lit's async lifecycle; core syntax.
  "oxc/no-async-await": "off",
  // Collides with `typescript/prefer-optional-chain`.
  "oxc/no-optional-chaining": "off",
  // Collides with the house list: bit operators stay allowed where needed.
  "no-bitwise": "off",
  // Collides with checks against the `undefined` that `Map#get` returns.
  "no-undefined": "off",
  // Collides with `typescript/no-floating-promises`, which asks for `void`.
  "no-void": "off",
  // Collides with `explicit-types/no-undefined-type`: `null` marks absence.
  "unicorn/no-null": "off",
  // Collides with `import/no-default-export`: modules export by name.
  "import/no-named-export": "off",
  // Collides with `typescript/consistent-type-imports` and
  // `typescript/no-import-type-side-effects`.
  "import/consistent-type-specifier-style": "off",
  // Collides with Oxfmt, which prints hexadecimal digits in lowercase.
  "unicorn/number-literal-case": "off",

  // Off, too much churn for no change in behavior.
  // Too much churn: every unit, index, and limit would need a constant.
  "no-magic-numbers": "off",
  // Too much churn: keys follow meaning, not the alphabet.
  "sort-keys": "off",
  // Too much churn: comments continue sentences and quote code.
  "capitalized-comments": "off",
  // Too much churn; `explicit-types/require-return-type` covers it.
  "typescript/explicit-function-return-type": "off",
  // Too much churn; `explicit-types/require-return-type` covers it.
  "typescript/explicit-module-boundary-types": "off",
  // Too much churn: no-op callbacks and lifecycle stubs are empty.
  "no-empty-function": "off",
  // Too much churn: Lit render helpers are methods without `this`.
  "class-methods-use-this": "off",
  // Too much churn: braces on every `case` for no scoping need.
  "unicorn/switch-case-braces": "off",
  // Too much churn: plain property reads would become destructuring.
  "prefer-destructuring": "off",
  // Too much churn: object spread is the house way to copy state.
  "oxc/no-rest-spread-properties": "off",
  // Too much churn: separators in every long number literal.
  "unicorn/numeric-separators-style": "off",
  // Too much churn: early `continue` keeps loops flat.
  "no-continue": "off",

  // Off, other checks cover it or the pattern is intended.
  // Sequential awaits in a loop are intended; workarounds cost more.
  "no-await-in-loop": "off",
  // Not type-aware; TypeScript's `noImplicitReturns` covers it.
  "consistent-return": "off",
  // Misfires on complete switches; TypeScript's `noImplicitReturns` covers it.
  "typescript/consistent-return": "off",
  // TypeScript's type checking already covers exhaustive switches.
  "typescript/switch-exhaustiveness-check": "off",
  // TypeScript checks completeness; a forced `default:` hides missing cases.
  "default-case": "off",
};

/**
 * Node code: `scripts/**` and `vite.config.ts` run on Node, not in the
 * browser, and load through their default export.
 */
const nodeRules: DummyRuleMap = {
  // Node code: Vite and Oxlint load these through their default export.
  "import/no-default-export": "off",
  // Node code: the scripts import `node:` modules.
  "import/no-nodejs-modules": "off",
  // Node code: a CLI script sets its exit code.
  "unicorn/no-process-exit": "off",
};

/**
 * Every override, used by `vite.config.ts` as its whole `overrides` list.
 * The Node-code entry comes first; per-file exceptions follow, each with
 * its reason. A later entry wins over an earlier one.
 */
export const projectOverrides: OxlintOverride[] = [
  // Node code, loaded by Vite and Oxlint through its default export.
  { files: ["vite.config.ts", "scripts/**"], rules: nodeRules },
];

/**
 * The repo-local plugin, namespace `project`: its own rules, enabled as
 * `project/<rule>`, and `configs.project`, the rule list above.
 */
export const projectLint = {
  meta: { name: "project" },
  rules: {
    "no-asset-imports": noAssetImportsRule,
    "no-disable-comments": noDisableCommentsRule,
    "no-modifier-private": noModifierPrivateRule,
    "no-duplicate-interfaces": noDuplicateInterfacesRule,
    "no-duplicate-typeofs": noDuplicateTypeofsRule,
    "no-duplicate-types": noDuplicateTypesRule,
    "no-empty-yield": noEmptyYieldRule,
    "no-nan": noNanRule,
    "no-unsafe-number": noUnsafeNumberRule,
    "no-useless-continue": noUselessContinueRule,
    "no-useless-type": noUselessTypeRule,
    "prefer-ascii": preferAsciiRule,
  },
  configs: { project: { rules } },
};

export default projectLint;
