use base64::{engine::general_purpose::{URL_SAFE_NO_PAD, URL_SAFE, STANDARD, STANDARD_NO_PAD}, Engine as _};
use serde::Deserialize;
use serde_json::json;

// ── Structs ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GmailTokenResponse {
    pub access_token: String,
    pub scope: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GoogleTokenInfoResponse {
    pub scope: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
pub struct GmailMessagesListResponse {
    pub messages: Option<Vec<GmailMessageId>>,
    #[allow(dead_code)]
    pub resultSizeEstimate: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct GmailMessageId {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
pub struct GmailMessageResponse {
    pub snippet: Option<String>,
    pub payload: Option<GmailMessagePart>,
    #[allow(dead_code)]
    pub internalDate: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
pub struct GmailMessagePart {
    pub mimeType: Option<String>,
    pub filename: Option<String>,
    pub headers: Option<Vec<GmailHeader>>,
    pub body: Option<GmailBody>,
    pub parts: Option<Vec<GmailMessagePart>>,
}

#[derive(Debug, Deserialize)]
pub struct GmailHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
pub struct GmailBody {
    pub data: Option<String>,
    pub attachmentId: Option<String>,
    #[allow(dead_code)]
    pub size: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct GmailAttachmentResponse {
    pub data: Option<String>,
}

// ── Funções auxiliares ───────────────────────────────────────

fn get_non_empty_env(var_name: &str) -> Option<String> {
    std::env::var(var_name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn resolve_google_refresh_token() -> Option<String> {
    if let Some(token) = get_non_empty_env("GOOGLE_REFRESH_TOKEN") {
        return Some(token);
    }
    let legacy = get_non_empty_env("GOOGLE_ACCESS_TOKEN")?;
    if legacy.starts_with("1//") {
        return Some(legacy);
    }
    None
}

fn has_gmail_read_scope(scopes: &str) -> bool {
    let valid = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://mail.google.com/",
    ];
    scopes
        .split_whitespace()
        .any(|s| valid.iter().any(|v| v == &s))
}

fn has_gmail_send_scope(scopes: &str) -> bool {
    let valid = [
        "https://www.googleapis.com/auth/gmail.send",
        "https://mail.google.com/",
    ];
    scopes
        .split_whitespace()
        .any(|s| valid.iter().any(|v| v == &s))
}

pub fn decode_gmail_body(data: &str) -> Option<String> {
    let decoded = URL_SAFE_NO_PAD.decode(data).ok()?;
    String::from_utf8(decoded).ok()
}

pub fn decode_gmail_body_bytes(data: &str) -> Option<Vec<u8>> {
    // Limpa whitespace/newlines que podem vir na resposta
    let cleaned: String = data.chars().filter(|c| !c.is_whitespace()).collect();

    // Tenta múltiplas estratégias de decodificação
    URL_SAFE_NO_PAD.decode(&cleaned)
        .or_else(|_| URL_SAFE.decode(&cleaned))
        .or_else(|_| STANDARD.decode(&cleaned))
        .or_else(|_| STANDARD_NO_PAD.decode(&cleaned))
        .ok()
}


pub fn extract_plain_text_body(part: &GmailMessagePart) -> Option<String> {
    let is_attachment = part
        .filename
        .as_ref()
        .map(|f| !f.is_empty())
        .unwrap_or(false);

    if !is_attachment && part.mimeType.as_deref() == Some("text/plain") {
        if let Some(data) = part.body.as_ref().and_then(|b| b.data.as_ref()) {
            return decode_gmail_body(data);
        }
    }

    if let Some(parts) = &part.parts {
        for child in parts {
            if let Some(value) = extract_plain_text_body(child) {
                return Some(value);
            }
        }
    }

    if !is_attachment && part.mimeType.as_deref() == Some("text/html") {
        if let Some(data) = part.body.as_ref().and_then(|b| b.data.as_ref()) {
            return decode_gmail_body(data);
        }
    }

    None
}

pub fn get_header_value(headers: Option<&Vec<GmailHeader>>, header_name: &str) -> Option<String> {
    headers.and_then(|list| {
        list.iter()
            .find(|h| h.name.eq_ignore_ascii_case(header_name))
            .map(|h| h.value.clone())
    })
}

/// Extrai email puro de header From: "Nome <email@x.com>" → "email@x.com"
pub fn extract_email_from_header(from: &str) -> String {
    if let Some(start) = from.find('<') {
        if let Some(end) = from.find('>') {
            return from[start + 1..end].trim().to_lowercase();
        }
    }
    from.trim().to_lowercase()
}

/// Coleta attachment IDs de partes XML do email
pub fn collect_xml_attachment_ids(part: &GmailMessagePart) -> Vec<(String, String)> {
    let mut result = Vec::new();

    let is_xml = part
        .filename
        .as_ref()
        .map(|f| {
            let lower = f.to_lowercase();
            !f.is_empty() && (lower.ends_with(".xml"))
        })
        .unwrap_or(false);

    if is_xml {
        if let Some(att_id) = part.body.as_ref().and_then(|b| b.attachmentId.as_ref()) {
            let filename = part.filename.clone().unwrap_or_default();
            result.push((att_id.clone(), filename));
        }
    }

    if let Some(parts) = &part.parts {
        for child in parts {
            result.extend(collect_xml_attachment_ids(child));
        }
    }

    result
}

// ── Cliente Gmail ────────────────────────────────────────────

pub struct GmailClient {
    http: reqwest::Client,
    access_token: String,
}

impl GmailClient {
    /// Autentica via OAuth2 refresh token e retorna um GmailClient pronto.
    /// Agora aceita opcionalmente um refresh token já resolvido (do AuthState).
    pub async fn authenticate() -> Result<Self, String> {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .ok()
            .or_else(|| option_env!("GOOGLE_CLIENT_ID").map(|s| s.to_string()))
            .ok_or_else(|| "GOOGLE_CLIENT_ID não definido".to_string())?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .ok()
            .or_else(|| option_env!("GOOGLE_CLIENT_SECRET").map(|s| s.to_string()))
            .ok_or_else(|| "GOOGLE_CLIENT_SECRET não definido".to_string())?;

        // Tenta token do AuthState (login) primeiro, depois fallback env var
        let refresh_token = {
            let auth = crate::google_auth::get_global_auth_state();
            let guard = auth.lock().await;
            guard.get_refresh_token()
        }
        .ok_or_else(|| "Nenhum token de autenticação encontrado. Faça login com sua conta Google.".to_string())?;

        let http = reqwest::Client::new();

        let response = http
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("refresh_token", refresh_token.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| format!("Erro ao obter token do Google: {}", e))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Erro de autenticação no Google ({}): {}", status, body));
        }

        let token: GmailTokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Resposta JSON inválida do Google OAuth: {}", e))?;

        // Validar escopos
        let scopes = if let Some(s) = token.scope.as_deref() {
            Some(s.to_string())
        } else {
            let info_resp = http
                .get("https://www.googleapis.com/oauth2/v1/tokeninfo")
                .query(&[("access_token", token.access_token.as_str())])
                .send()
                .await
                .ok();
            if let Some(resp) = info_resp {
                resp.json::<GoogleTokenInfoResponse>()
                    .await
                    .ok()
                    .and_then(|i| i.scope)
            } else {
                None
            }
        };

        if let Some(s) = scopes.as_deref() {
            if !has_gmail_read_scope(s) || !has_gmail_send_scope(s) {
                return Err(format!(
                    "GOOGLE_REFRESH_TOKEN sem permissão de inbox ou envio. Escopos: {}",
                    s
                ));
            }
        }

        Ok(Self {
            http,
            access_token: token.access_token,
        })
    }

    /// Busca emails que correspondam à query Gmail
    pub async fn search_messages(&self, query: &str, max_results: u32) -> Result<Vec<String>, String> {
        let response = self
            .http
            .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
            .query(&[
                ("q", query),
                ("maxResults", &max_results.to_string()),
            ])
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Erro ao buscar emails: {}", e))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Erro Gmail search ({}): {}", status, body));
        }

        let list: GmailMessagesListResponse = serde_json::from_str(&body)
            .map_err(|e| format!("JSON inválido em search: {}", e))?;

        Ok(list
            .messages
            .unwrap_or_default()
            .into_iter()
            .map(|m| m.id)
            .collect())
    }

    /// Busca uma mensagem completa pelo ID
    pub async fn get_message(&self, message_id: &str) -> Result<GmailMessageResponse, String> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
            message_id
        );

        let response = self
            .http
            .get(&url)
            .query(&[("format", "full")])
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Erro ao buscar email {}: {}", message_id, e))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Erro ao ler email {} ({}): {}", message_id, status, body));
        }

        serde_json::from_str(&body)
            .map_err(|e| format!("JSON inválido para email {}: {}", message_id, e))
    }

    pub async fn mark_message_as_read(&self, message_id: &str) -> Result<(), String> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/modify",
            message_id
        );

        let payload = json!({
            "removeLabelIds": ["UNREAD"]
        });

        let response = self
            .http
            .post(&url)
            .bearer_auth(&self.access_token)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Erro ao marcar email como lido {}: {}", message_id, e))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            eprintln!("[GmailClient] falha ao marcar mensagem {} como lida: status={} body={}", message_id, status, body);
            return Err(format!("Erro Gmail modify ({}): {}", status, body));
        }

        Ok(())
    }

    /// Download de um attachment pelo ID
    pub async fn get_attachment(&self, message_id: &str, attachment_id: &str) -> Result<Vec<u8>, String> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}/attachments/{}",
            message_id, attachment_id
        );

        let response = self
            .http
            .get(&url)
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Erro ao baixar attachment: {}", e))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Erro attachment ({}): {}", status, body));
        }

        let att: GmailAttachmentResponse = serde_json::from_str(&body)
            .map_err(|e| format!("JSON inválido attachment: {}", e))?;

        let data = att
            .data
            .ok_or_else(|| "Attachment sem dados".to_string())?;

        decode_gmail_body_bytes(&data).ok_or_else(|| "Erro ao decodificar attachment base64".to_string())
    }

    pub async fn send_email(&self, to: &str, subject: &str, body_text: &str) -> Result<(), String> {
        // RFC 2047: encode subject with non-ASCII chars as =?UTF-8?B?<base64>?=
        let encoded_subject = format!("=?UTF-8?B?{}?=", STANDARD.encode(subject.as_bytes()));

        let raw_message = format!(
            "From: me\r\nTo: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\nMIME-Version: 1.0\r\n\r\n{}",
            to, encoded_subject, body_text
        );

        let encoded = URL_SAFE_NO_PAD.encode(raw_message.as_bytes());
        let payload = serde_json::json!({ "raw": encoded });

        let response = self
            .http
            .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
            .bearer_auth(&self.access_token)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Erro ao enviar email: {}", e))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Erro Gmail send ({}): {}", status, body));
        }

        Ok(())
    }

    /// Retorna status da inbox (mantém compatibilidade)
    #[allow(dead_code)]
    pub async fn get_inbox_status(&self) -> Result<InboxStatus, String> {
        let inbox_ids = self.search_messages("label:INBOX", 1).await?;
        let _unread_ids = self.search_messages("label:INBOX is:unread", 1).await?;

        // resultSizeEstimate precisa vir do response original, então fazemos query direta
        let inbox_resp = self
            .http
            .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
            .query(&[("labelIds", "INBOX"), ("maxResults", "1")])
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Erro ao listar inbox: {}", e))?;
        let inbox_list: GmailMessagesListResponse =
            serde_json::from_str(&inbox_resp.text().await.unwrap_or_default())
                .unwrap_or(GmailMessagesListResponse { messages: None, resultSizeEstimate: Some(0) });

        let unread_resp = self
            .http
            .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
            .query(&[("labelIds", "INBOX"), ("labelIds", "UNREAD"), ("maxResults", "1")])
            .bearer_auth(&self.access_token)
            .send()
            .await
            .map_err(|e| format!("Erro ao listar não lidos: {}", e))?;
        let unread_list: GmailMessagesListResponse =
            serde_json::from_str(&unread_resp.text().await.unwrap_or_default())
                .unwrap_or(GmailMessagesListResponse { messages: None, resultSizeEstimate: Some(0) });

        let total = inbox_list.resultSizeEstimate.unwrap_or(0);
        let nao_lidos = unread_list.resultSizeEstimate.unwrap_or(0);

        let mut assunto = None;
        let mut de = None;
        let mut corpo = None;

        if let Some(first_id) = inbox_ids.first() {
            let msg = self.get_message(first_id).await?;
            assunto = msg.payload.as_ref().and_then(|p| get_header_value(p.headers.as_ref(), "Subject"));
            de = msg.payload.as_ref().and_then(|p| get_header_value(p.headers.as_ref(), "From"));
            corpo = msg
                .payload
                .as_ref()
                .and_then(extract_plain_text_body)
                .or(msg.snippet);
        }

        Ok(InboxStatus {
            total_emails: total,
            nao_lidos,
            assunto_mais_novo: assunto,
            de_mais_novo: de,
            corpo_mais_novo: corpo,
        })
    }
}

#[derive(Debug, serde::Serialize)]
#[allow(dead_code)]
pub struct InboxStatus {
    pub total_emails: u32,
    pub nao_lidos: u32,
    pub assunto_mais_novo: Option<String>,
    pub de_mais_novo: Option<String>,
    pub corpo_mais_novo: Option<String>,
}
