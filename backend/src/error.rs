use anyhow::Result;

pub trait ReportError<T> {
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
