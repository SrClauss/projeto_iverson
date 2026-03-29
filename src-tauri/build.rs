fn main() {
    // Garante recompilação se os secrets mudarem na CI
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_SECRET");
    println!("cargo:rerun-if-env-changed=GEMINI_API_KEY");
    println!("cargo:rerun-if-env-changed=DB_URI");
    println!("cargo:rerun-if-env-changed=GOOGLE_SHEETS_ID");
    tauri_build::build()
}
