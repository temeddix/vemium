---
description: The lint bans every Lit lifecycle override, so lifecycle work lives in reactive controllers whose constructor takes only the host and a chainable setter wires the host's callback
---

# Controllers Without Lifecycles

The `eslint-plugin-lit-robust` `all` config bans every lifecycle override
(`lifecycle-allowlist`), timers, listeners, and `fetch` in components, and
`host-constructor` insists a reactive controller's constructor is exactly
`constructor(host: ReactiveControllerHost)`. So the frontend moves that work
into controllers in `frontend/src/web-components/`, each wired by a
chainable method that returns `this`:

```ts
storeSubscription: StoreController = new StoreController(this).track(
  (): DashboardStore | null => this.store,
  (next: DashboardState): void => {
    this.dashboardState = next;
  },
);
```

- `StoreController`: subscribes to the context-provided `DashboardStore`,
  moves to a new store when the host gets one, unsubscribes on disconnect.
- `IntervalController`: a tick right away and on every interval while
  connected (`schedule(ms, onTick)`).
- `WindowScrollController`: the window's passive `scroll` listener.
- `ModelListController`: the settings page's debounced per-tier model list.
- `EventPreviewController`: the hovercard's cached, abortable event fetch.
- `UpdateEffectController`: the host's own work on connect, after each
  update, and on disconnect (`onConnected`/`onUpdated`/`onDisconnected`).
  It replaces what `updated()` did; a value that `updated()` compared through
  `changed.has(...)` is tracked in a private field instead.

The callbacks belong to the host and touch only its own state; a controller
never reaches into the host's private fields. A controller nothing reads
after construction is kept in a public field, since a `#private` field that
is never read fails `noUnusedLocals`. `paired-lifecycle` requires
`hostConnected` and `hostDisconnected` together.
