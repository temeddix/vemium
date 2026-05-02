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

pub mod leader;
pub mod python;
pub mod web_fetch;
pub mod workspace;
