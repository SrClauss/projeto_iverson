use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

/// Returns the directory where audit log files are stored.
/// Creates the directory if it does not already exist.
pub fn audit_dir() -> PathBuf {
    let base = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("iverson-app").join("auditorias");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Sanitizes a string so it can be used safely as part of a file name.
fn sanitize_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect()
}

/// Appends a timestamped entry to the audit log file for the given orçamento.
///
/// * `orcamento_id` – the hex ObjectId of the orçamento (use `"sem_id"` when the
///   orçamento has not been identified yet).
/// * `message` – free-form text to record.  Multi-line strings are supported.
pub fn append_audit_log(orcamento_id: &str, message: &str) {
    let dir = audit_dir();
    let filename = format!("orcamento_{}.txt", sanitize_id(orcamento_id));
    let path = dir.join(filename);

    let timestamp = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC");

    // Indent continuation lines so the log is easier to read.
    let indented = message
        .lines()
        .enumerate()
        .map(|(i, line)| {
            if i == 0 {
                format!("[{}] {}", timestamp, line)
            } else {
                format!("                     | {}", line)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    let entry = format!("{}\n", indented);

    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut file) => {
            let _ = file.write_all(entry.as_bytes());
        }
        Err(e) => {
            eprintln!("[AuditLog] Erro ao abrir {}: {}", path.display(), e);
        }
    }
}

/// Convenience helper: logs a separator line to make the file easier to scan.
pub fn append_section_separator(orcamento_id: &str, title: &str) {
    let separator = format!(
        "──────────────────────────────────────────────────────────────────\n{}",
        title
    );
    append_audit_log(orcamento_id, &separator);
}
