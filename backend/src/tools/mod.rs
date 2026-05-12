//! Tool implementations available to the debate agents.
//!
//! Each submodule implements one tool exposed to the LLM via Rig's
//! [`rig::tool::Tool`] trait. The trait gives us typed arguments
//! (`type Args`), typed outputs (`type Output`), typed errors
//! (`type Error`), and a JSON schema derived from `definition()`.
//!
//! Each tool owns the lifecycle of its own inline-note row: it opens a
//! [`crate::event_log::RowHandle`] on entry, streams body content as the
//! work progresses (notably [`python::RunPythonTool`] which forwards
//! stdout line-by-line), and finalizes with `success = true/false` when
//! it returns. The orchestrator hook only
//! handles balloon and thinking rows on the active turn; tool inline
//! notes appear as side rows around them.
//!
//! - [`browser`]: browser automation tools (`browser_navigate`,
//!   `browser_click`, `browser_take_screenshot`, etc.) backed by
//!   chromiumoxide. Each room gets an isolated browser context.
//! - [`download_file`]: saves an arbitrary HTTP response body to
//!   `raw/` and returns the path. Filename comes from
//!   `Content-Disposition`, the URL basename, or a hash. Streams progress
//!   into the inline note row like [`python::RunPythonTool`] streams
//!   stdout.
//! - [`document_to_md`]: converts a local document (PDF, XLSX, DOCX,
//!   image-with-text, …) into Markdown via [`kreuzberg`], saved next to
//!   the source as `<basename>.md`.
//! - [`python`]: write-and-run Python scripts inside the room workspace,
//!   gated on `ruff` and `ty` checks. Streams stdout / stderr into the
//!   inline note's body as the script runs.
//! - [`workspace`]: filesystem helpers (list / create / read / write)
//!   sandboxed under the room's directory.
//! - [`leader`]: agents call this to request a high-model decision when an
//!   important judgment is needed.
//! - [`do_nothing`]: a shared opt-out tool used by personas and the leader
//!   gates to record an inline note instead of producing a chat bubble.
//! - [`get_room_event`]: looks up any room-event row by id; works for all
//!   kinds, including compacted bubble content.
//! - [`pause_room`] / [`resume_room`]: leader gate tools that pause or
//!   resume the debate. They flip the [`crate::models::DebateState`]
//!   axis only - the user-controlled
//!   [`crate::models::RoomState`] axis is moved by the
//!   `/v1/rooms/:code/{activate,deactivate}` HTTP routes instead.

pub mod browser;
pub mod do_nothing;
pub mod document_to_md;
pub mod download_file;
pub mod get_room_event;
pub mod pause_room;
pub mod python;
pub mod resume_room;
pub mod select_next_agent;
pub mod shell;
pub mod workspace;
