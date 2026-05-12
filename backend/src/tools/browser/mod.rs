//! Native chromiumoxide browser tools exposed to the debate agents.
//!
//! Each submodule is one tool struct implementing [`rig::tool::Tool`].
//! All tools take a [`BrowserHandle`] and route calls through the
//! active tab. A single shared `BrowserToolError` enum covers all
//! error variants so tools do not need individual error types.

use thiserror::Error;

pub mod click;
pub mod close;
pub mod console_messages;
pub mod drag;
pub mod drop_files;
pub mod evaluate;
pub mod file_upload;
pub mod fill_form;
pub mod handle_dialog;
pub mod hover;
pub mod navigate;
pub mod navigate_back;
pub mod network_requests;
pub mod press_key;
pub mod resize;
pub mod scroll;
pub mod select_option;
pub mod snapshot;
pub mod take_screenshot;
pub mod type_text;
pub mod wait_for;

pub use click::BrowserClickTool;
pub use close::BrowserCloseTool;
pub use console_messages::BrowserConsoleMessagesTool;
pub use drag::BrowserDragTool;
pub use drop_files::BrowserDropTool;
pub use evaluate::BrowserEvaluateTool;
pub use file_upload::BrowserFileUploadTool;
pub use fill_form::BrowserFillFormTool;
pub use handle_dialog::BrowserHandleDialogTool;
pub use hover::BrowserHoverTool;
pub use navigate::BrowserNavigateTool;
pub use navigate_back::BrowserNavigateBackTool;
pub use network_requests::BrowserNetworkRequestsTool;
pub use press_key::BrowserPressKeyTool;
pub use resize::BrowserResizeTool;
pub use scroll::BrowserScrollTool;
pub use select_option::BrowserSelectOptionTool;
pub use snapshot::BrowserSnapshotTool;
pub use take_screenshot::BrowserTakeScreenshotTool;
pub use type_text::BrowserTypeTool;
pub use wait_for::BrowserWaitForTool;

/// Unified error type for all browser tools.
#[derive(Debug, Error)]
pub enum BrowserToolError {
  #[error("browser error: {0}")]
  Browser(String),
  #[error("CDP error: {0}")]
  Cdp(String),
  #[error("workspace error: {0}")]
  Workspace(String),
}
