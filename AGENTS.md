This repository is a Rust backend web server with a Lit SPA frontend.

# Common

- Use English only for code, comments, logs, API messages, UI copy, and
  documentation.
- Backend architecture is REST API only. Do not add server-side template
  rendering.
- Frontend architecture is SPA only. SEO-oriented SSR or SSG is out of scope.
- Frontend UI text must be English only.
- Real-time UI updates must use WebSocket only. Do not implement API polling for
  live agent events.
- Client reconnection logic is required when WebSocket disconnects. Use
  backoff/interval retry attempts for reconnect handling.
- Keep solutions minimal: remove unnecessary code and reuse existing functions,
  types, and constants before adding new ones.
- After UI changes, verify behavior in browser tooling and resolve all lint/type
  issues before marking work complete.

# Frontend Guidelines

Run frontend quality checks before completion. Use the project scripts if
available.

- `deno check`
- `deno fmt`
- `deno lint`

## TypeScript Style

- Use double quotes.
- Use two spaces for indentation.
- Naming:
  - constants: `UPPER_SNAKE_CASE`
  - variables and functions: `camelCase`
  - classes, interfaces, and types: `PascalCase`
- At module scope, prefer `function myFunc(): ReturnType {}`.
- For local callbacks, prefer `const myFunc = (): ReturnType => {}`.
- Prefer direct imports (for example: `import { css, html } from "lit"`).
- Prefer type narrowing with `typeof` and `instanceof` instead of type
  assertions.
- Prefer `const` over `let` when reassignment is not needed.
- Avoid `any`.
- Use `/** */` for doc comments on exported/public items.
- Use named exports only. Do not use `export default`.
- Avoid global mutable state.
- Avoid utility types that obscure contracts in app-level code; prefer explicit
  concrete types.
- Avoid parameter destructuring in function signatures for complex objects; read
  properties in the function body.

## Web Components

- Build UI with Lit web components.
- Extend the global interface `HTMLElementTagNameMap` after registering a custom
  web component. Put it right over the web component declaration.
- Never use Redux-like state management patterns.
- If shared state is needed, use Lit provider-consumer patterns.
- Prefer composition-first UI design over monolithic component structures.
- Use Web Awesome as the design system and theming foundation.
- The UI should feel sleek and intentional with the Web Awesome theme system.
  Use clear typography hierarchy, spacing rhythm, and tokenized color usage.
- Use CSS variables for theme tokens and visual consistency.
- Register custom elements with the `te-` prefix.
- Extend `HTMLElementTagNameMap` for each registered custom element.
- Prefer Lit decorators for reactive properties.
- Prefer template event bindings (`@event`) over manual `addEventListener` in
  render paths.
- Prefer Lit `ref` directive instead of querying DOM with selectors when
  practical.
- Keep styles encapsulated in `static override styles`.
- Keep CSS concise and intentional.
- Avoid `setTimeout`/`requestAnimationFrame` for lifecycle orchestration when
  Lit lifecycle hooks can handle it.
- Move large conditional blocks out of template return expressions into helper
  methods.

## Lifecycle and Cleanup

- Create external resources in `connectedCallback`.
- Dispose resources in `disconnectedCallback`.
- Call `super.connectedCallback()` at the start of `connectedCallback`.
- Call `super.disconnectedCallback()` at the end of `disconnectedCallback`.
- Clean up all listeners/subscriptions to prevent leaks.

## CSS Units

- Use `rem` for typography, spacing, and most layout sizing.
- Use `px` for borders, fine-grained shadows, and precise one-off pixel control.

## TypeScript Module Structure

- Follow the intro_server-style frontend module organization pattern.
- Keep a single frontend bundle entry module (for example: `frontend/mod.ts`).
- Use structured exports with local `mod.ts` files for internal module groups.
- Use `deno bundle` to produce browser-consumable JavaScript from TypeScript.
- Keep bundling commands in Deno tasks (for example: `deno task bundle`).

# Backend Guidelines

Run Rust checks before completion:

- `cargo fmt`
- `cargo check`
- `cargo clippy --all-targets --all-features -- -D warnings`

## Rust Style

- Keep functions focused and reasonably short. Split long or heavily indented
  logic into helper functions.
- Naming:
  - constants: `UPPER_SNAKE_CASE`
  - variables and functions: `snake_case`
  - structs, traits, enums, and types: `PascalCase`
- Prefer async, non-blocking I/O (`tokio`, async database/network clients, async
  file APIs).
- If blocking work is unavoidable, isolate it with
  `tokio::task::spawn_blocking`.
- Use `anyhow` for application-level error handling. Use `bail!` and `anyhow!`
  macros.
- Use `tracing` for logs. Do not use `println!`/`eprintln!`.
- Keep REST handlers thin; move business logic into services/modules.
- Keep transport models (request/response DTOs) explicit and stable.
- Always use `PathBuf` for representing file paths.

## API Conventions

- REST-first resource design.
- Return consistent JSON structures.
- Use clear HTTP status codes.
- Validate inputs at API boundaries.
- Keep all human-readable API messages in English.

# Scope Guardrails

- Do not introduce template engines or server-rendered HTML flows.
- Do not introduce frontend frameworks other than Lit.
- Do not introduce SEO/SSR work unless requirements change.
