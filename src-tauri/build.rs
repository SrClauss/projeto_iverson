fn emit_build_env(name: &str) {
    println!("cargo:rerun-if-env-changed={}", name);

    if let Ok(value) = std::env::var(name) {
        println!("cargo:rustc-env={}={}", name, value);
    }
}

fn main() {
    // Garante recompilação se os secrets mudarem na CI
    emit_build_env("GOOGLE_CLIENT_ID");
    emit_build_env("GOOGLE_CLIENT_SECRET");
    emit_build_env("GEMINI_API_KEY");
    emit_build_env("DB_URI");
    emit_build_env("GOOGLE_SHEETS_ID");
    emit_build_env("SEGREDO_TESTE");

    tauri_build::build()
}
