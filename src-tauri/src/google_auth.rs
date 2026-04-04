use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use once_cell::sync::Lazy;

/// Porta local usada para receber o callback OAuth2
const CALLBACK_PORT: u16 = 8847;
const REDIRECT_URI: &str = "http://localhost:8847/callback";

/// Escopos necessários para acessar o Gmail
const GMAIL_SCOPES: &str = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

// ── Global auth state ─────────────────────────────────────────

static GLOBAL_AUTH_STATE: Lazy<SharedAuthState> = Lazy::new(|| {
    create_auth_state()
});

pub fn get_global_auth_state() -> SharedAuthState {
    GLOBAL_AUTH_STATE.clone()
}

// ── Stored Token ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredToken {
    pub refresh_token: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub email: Option<String>,
}

// ── Estado em memória ─────────────────────────────────────────

pub struct AuthState {
    token: Option<StoredToken>,
    /// Quando true, ignora o fallback da variável de ambiente
    /// (usuário fez logout explicitamente)
    force_logged_out: bool,
}

impl AuthState {
    pub fn new() -> Self {
        let token = load_stored_token();
        let force_logged_out = logout_marker_exists();
        if token.is_some() {
            println!("[GoogleAuth] Token carregado do disco");
        }
        Self { token, force_logged_out }
    }

    pub fn get_refresh_token(&self) -> Option<String> {
        // Primeiro tenta o token armazenado via login
        if let Some(ref stored) = self.token {
            return Some(stored.refresh_token.clone());
        }
        // Se o usuário fez logout explicitamente, não usa env var
        if self.force_logged_out {
            return None;
        }
        // Fallback para variável de ambiente (compatibilidade)
        crate::gmail_client::resolve_google_refresh_token()
    }

    pub fn set_token(&mut self, token: StoredToken) {
        self.force_logged_out = false;
        delete_logout_marker();
        save_stored_token(&token);
        self.token = Some(token);
    }

    pub fn clear(&mut self) {
        self.token = None;
        self.force_logged_out = true;
        delete_stored_token();
        save_logout_marker();
    }

    pub fn status(&self) -> AuthStatus {
        // Token salvo via login → autenticado
        if let Some(t) = &self.token {
            return AuthStatus {
                authenticated: true,
                email: t.email.clone(),
            };
        }
        // Logout explícito → nunca usa fallback
        if self.force_logged_out {
            return AuthStatus { authenticated: false, email: None };
        }
        // Fallback: variável de ambiente (primeira execução, sem login ainda)
        let has_env = crate::gmail_client::resolve_google_refresh_token().is_some();
        AuthStatus {
            authenticated: has_env,
            email: if has_env {
                Some("(via variável de ambiente)".to_string())
            } else {
                None
            },
        }
    }
}

pub type SharedAuthState = Arc<Mutex<AuthState>>;

pub fn create_auth_state() -> SharedAuthState {
    Arc::new(Mutex::new(AuthState::new()))
}

// ── Persistência em arquivo ──────────────────────────────────

fn token_file_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("iverson-app");
    std::fs::create_dir_all(&dir).ok();
    dir.join("google_token.json")
}

fn logout_marker_path() -> PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("iverson-app");
    std::fs::create_dir_all(&dir).ok();
    dir.join(".logged_out")
}

fn logout_marker_exists() -> bool {
    logout_marker_path().exists()
}

fn save_logout_marker() {
    let _ = std::fs::write(logout_marker_path(), "1");
}

fn delete_logout_marker() {
    let _ = std::fs::remove_file(logout_marker_path());
}

fn load_stored_token() -> Option<StoredToken> {
    let path = token_file_path();
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_stored_token(token: &StoredToken) {
    let path = token_file_path();
    if let Ok(json) = serde_json::to_string_pretty(token) {
        let _ = std::fs::write(&path, json);
        println!("[GoogleAuth] Token salvo em {:?}", path);
    }
}

fn delete_stored_token() {
    let path = token_file_path();
    let _ = std::fs::remove_file(&path);
    println!("[GoogleAuth] Token removido");
}

// ── Gerador de URL de autorização ────────────────────────────

pub fn build_auth_url() -> Result<String, String> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("GOOGLE_CLIENT_ID").map(|s| s.to_string()))
        .ok_or_else(|| "GOOGLE_CLIENT_ID não definido".to_string())?;

    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={}&\
         redirect_uri={}&\
         response_type=code&\
         scope={}&\
         access_type=offline&\
         prompt=consent",
        urlencoding::encode(&client_id),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(GMAIL_SCOPES),
    );

    Ok(url)
}

// ── Servidor HTTP local para capturar callback ───────────────

/// Inicia um mini-servidor HTTP que escuta UMA requisição em /callback,
/// extrai o `code` da query string e retorna.
pub async fn wait_for_auth_code() -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind(format!("127.0.0.1:{}", CALLBACK_PORT))
        .await
        .map_err(|e| format!("Erro ao abrir porta {}: {}", CALLBACK_PORT, e))?;

    println!("[GoogleAuth] Aguardando callback em http://localhost:{}/callback ...", CALLBACK_PORT);

    let (mut stream, _addr) = listener
        .accept()
        .await
        .map_err(|e| format!("Erro ao aceitar conexão: {}", e))?;

    let mut buf = vec![0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Erro ao ler request: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]).to_string();

    // Extrair o path da primeira linha: "GET /callback?code=xxx HTTP/1.1"
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    // Buscar o parâmetro `code`
    let code = extract_query_param(path, "code");
    let error = extract_query_param(path, "error");

    let (status_code, html_body) = if let Some(ref code) = code {
        let _ = code; // Usado abaixo
        (
            "200 OK",
            r#"<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a1a2e;color:#e0e0e0">
            <h1 style="color:#22c55e">✅ Login realizado com sucesso!</h1>
            <p>Você já pode fechar esta aba e voltar ao Iverson.</p>
            </body></html>"#,
        )
    } else {
        let err_msg = error.as_deref().unwrap_or("desconhecido");
        eprintln!("[GoogleAuth] Erro no callback: {}", err_msg);
        (
            "400 Bad Request",
            r#"<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#1a1a2e;color:#e0e0e0">
            <h1 style="color:#ef4444">❌ Erro no login</h1>
            <p>Houve um problema na autorização. Tente novamente pelo app.</p>
            </body></html>"#,
        )
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n{}",
        status_code, html_body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    code.ok_or_else(|| {
        format!(
            "Autorização negada: {}",
            error.unwrap_or_else(|| "sem código retornado".to_string())
        )
    })
}

fn extract_query_param(path: &str, param_name: &str) -> Option<String> {
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == param_name {
            return Some(urlencoding::decode(value).unwrap_or_default().to_string());
        }
    }
    None
}

// ── Trocar code por tokens ───────────────────────────────────

#[derive(Debug, Deserialize)]
struct TokenExchangeResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserInfoResponse {
    email: Option<String>,
}

pub async fn exchange_code_for_tokens(code: &str) -> Result<StoredToken, String> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("GOOGLE_CLIENT_ID").map(|s| s.to_string()))
        .ok_or_else(|| "GOOGLE_CLIENT_ID não definido".to_string())?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .ok()
        .or_else(|| option_env!("GOOGLE_CLIENT_SECRET").map(|s| s.to_string()))
        .ok_or_else(|| "GOOGLE_CLIENT_SECRET não definido".to_string())?;

    let http = reqwest::Client::new();

    let resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", REDIRECT_URI),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Erro ao trocar code por token: {}", e))?;

    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Google OAuth token exchange falhou ({}): {}", status, body));
    }

    let tokens: TokenExchangeResponse = serde_json::from_str(&body)
        .map_err(|e| format!("JSON inválido na troca de token: {}", e))?;

    let refresh_token = tokens
        .refresh_token
        .ok_or("Google não retornou refresh_token. Tente revogar o acesso em https://myaccount.google.com/permissions e faça login novamente.")?;

    // Buscar email do usuário
    let email = fetch_user_email(&http, &tokens.access_token).await;

    Ok(StoredToken {
        refresh_token,
        email,
    })
}

async fn fetch_user_email(http: &reqwest::Client, access_token: &str) -> Option<String> {
    let resp = http
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let info: UserInfoResponse = resp.json().await.ok()?;
    info.email
}
