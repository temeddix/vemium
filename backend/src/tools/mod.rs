//! Tool implementations available to the debate agents.
//!
//! Each submodule implements one tool exposed to the LLM via Rig's
//! [`rig::tool::Tool`] trait. The trait gives us typed arguments
//! (`type Args`), typed outputs (`type Output`), typed errors
//! (`type Error`), and a JSON schema derived from `definition()`. Rig drives
//! the tool dispatch loop end-to-end inside the agent; we only need to
//! observe lifecycle events through [`crate::runtime::DebateHook`].
//!
//! Tool calls do not ride along on the assistant message that triggered
//! them. Instead the orchestrator's hook persists one `inline_note` row
//! per tool invocation, formatted by the tool's own
//! [`format_tool_inline_note`] dispatch arm. Tools therefore never insert
//! their own breadcrumb rows; only side-effect bubbles (e.g. the leader's
//! reply) stay inside the tool's `call()` method.
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

/// What a tool exposes for its inline-note breadcrumb. `text` is the short,
/// always-visible label rendered next to the author's avatar; `detail` is
/// the click-to-reveal body shown in the dialog. An empty `detail` makes
/// the breadcrumb a non-interactive label.
#[derive(Debug, Clone)]
pub struct InlineNote {
  pub text: String,
  pub detail: String,
}

/// Dispatcher used by [`crate::runtime::DebateHook`] when the model
/// finishes calling a tool. `args` and `result` are the raw JSON strings
/// that crossed the rig hook boundary; `ok` is rig's success flag (false
/// when the tool errored). Each known tool name routes to its own
/// formatter; unknown names fall back to a short generic label so the
/// timeline still gets a breadcrumb.
pub fn format_tool_inline_note(
  tool_name: &str,
  args: &str,
  result: &str,
  ok: bool,
) -> InlineNote {
  match tool_name {
    do_nothing::NAME => do_nothing::format_inline_note(args, result, ok),
    python::NAME => python::format_inline_note(args, result, ok),
    pause_room::NAME => pause_room::format_inline_note(args, result, ok),
    resume_room::NAME => resume_room::format_inline_note(args, result, ok),
    leader::NAME => leader::format_inline_note(args, result, ok),
    get_inline_note_detail::NAME => {
      get_inline_note_detail::format_inline_note(args, result, ok)
    }
    web_fetch::NAME => web_fetch::format_inline_note(args, result, ok),
    workspace::LIST_FOLDERS_NAME => {
      workspace::format_list_subject_folders_inline_note(args, result, ok)
    }
    workspace::CREATE_FOLDER_NAME => {
      workspace::format_create_subject_folder_inline_note(args, result, ok)
    }
    workspace::LIST_FILES_NAME => {
      workspace::format_list_files_inline_note(args, result, ok)
    }
    workspace::READ_FILE_NAME => {
      workspace::format_read_file_inline_note(args, result, ok)
    }
    workspace::WRITE_FILE_NAME => {
      workspace::format_write_file_inline_note(args, result, ok)
    }
    _ => generic_fallback(tool_name, result, ok),
  }
}

fn generic_fallback(tool_name: &str, result: &str, ok: bool) -> InlineNote {
  let text = if ok {
    format!("Called {tool_name}")
  } else {
    format!("{tool_name} failed")
  };
  InlineNote {
    text,
    detail: result.to_string(),
  }
}
