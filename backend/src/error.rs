//! Tiny error-handling helper used across the backend.
//!
//! [`ReportError`] takes any `Result` and converts it into an `Option`,
//! tracing the error on the way. Use it to *swallow* errors that are
//! incidental to the caller's success path — e.g. failing to persist an
//! audit row should not bring down the orchestrator. For errors that the
//! caller must handle, return the `Result` instead.

use anyhow::Result;

pub trait ReportError<T> {
  /// Logs the error via `tracing::error!` and returns `None`, otherwise
  /// returns `Some(value)`.
  fn report(self) -> Option<T>;
}

impl<T> ReportError<T> for Result<T> {
  fn report(self) -> Option<T> {
    match self {
      Ok(inner) => Some(inner),
      Err(err) => {
        tracing::error!("{:?}", err);
        None
      }
    }
  }
}
