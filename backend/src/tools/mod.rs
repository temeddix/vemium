//! Tool implementations available to the debate agents.
//!
//! Each submodule implements one tool exposed to the LLM via Rig's
//! [`rig::tool::Tool`] trait. The trait gives us typed arguments
//! (`type Args`), typed outputs (`type Output`), typed errors
//! (`type Error`), and a JSON schema derived from `definition()`. Rig drives
//! the tool dispatch loop end-to-end inside the agent; we only need to
//! observe lifecycle events through [`crate::runtime::DebateHook`].
//!
//! - [`web_fetch`]: HTTP GET, content extraction, and HTML->Markdown
//!   conversion for low-token-count consumption.
//! - [`python`]: write-and-run Python scripts inside the room workspace,
//!   gated on `ruff` and `ty` checks.
//! - [`workspace`]: filesystem helpers (list / create / read / write)
//!   sandboxed under the room's directory.
//! - [`leader`]: agents call this to request a high-model decision when an
//!   important judgment is needed.
//! - [`do_nothing`]: a shared opt-out tool used by personas and the leader
//!   gates to record an inline note instead of producing a chat bubble.
//! - [`get_inline_note_detail`]: looks up the click-to-reveal `detail`
//!   body of an inline-note row by id, so personas can dig into a
//!   breadcrumb (typically a Python-run traceback) without it being
//!   inlined into every transcript.
//! - [`pause_room`] / [`resume_room`]: leader gate tools that pause or
//!   resume the debate and persist a `leader_note` bubble explaining why.
//!   They flip the [`crate::models::DebateState`] axis only - the
//!   user-controlled [`crate::models::RoomState`] axis is moved by the
//!   `/v1/rooms/:code/{activate,deactivate}` HTTP routes instead.

pub mod do_nothing;
pub mod get_inline_note_detail;
pub mod leader;
pub mod pause_room;
pub mod python;
pub mod resume_room;
pub mod web_fetch;
pub mod workspace;
