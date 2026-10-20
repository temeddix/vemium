---
description: Enum-like string values are UPPER_SNAKE wherever we own the format, JSON wire and stored formats included; old spellings stay readable through serde aliases
---

User decision 2026-10-19, for every repo: an enum-like string value
(a string-union member) is UPPER_SNAKE everywhere we own the format,
including JSON sent over the wire and values stored in the databases.

```ts
export type RoomState = "ACTIVE" | "DEACTIVATED";
```

On the Rust side this matches `#[serde(rename_all = "SCREAMING_SNAKE_CASE")]`
on the enum, and the WebSocket frame tags (`"type": "ROW_DELTA"`) follow the
same rule. A format we do not own (BCP 47 language tags, MIME types, a
provider's API values, URL path segments such as `/activate`) is converted at
the boundary with explicit code, never by spreading the external spelling
through the code. See [[naming-id-match]].

Values written before the switch are still readable:

- Each serde enum variant keeps `#[serde(alias = "old_spelling")]`, so
  provider settings stored as JSON with `"apiType": "openRouter"` still load.
- `RoomState`, `DebateState`, and `RoomEventKind` are stored as text columns
  through `as_str()`/`parse()`; `parse()` accepts the old lowercase spelling
  too, and the migrations `0020_upper_snake_states.sql` (central DB) and
  `chat_migrations/0002_upper_snake_event_kinds.sql` (each `CHAT.db`)
  rewrite existing rows.
- The provider-models route accepts `LOW`/`HIGH` and the old `low`/`high`.
