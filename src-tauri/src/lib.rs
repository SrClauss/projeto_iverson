// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

mod cte_parser;
mod db;
mod email_watcher;
mod gemini_client;
mod gmail_client;
mod google_auth;

#[derive(Debug, Serialize)]
struct GmailInboxStatus {
    total_emails: u32,
    nao_lidos: u32,
    assunto_mais_novo: Option<String>,
    de_mais_novo: Option<String>,
    corpo_mais_novo: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GmailTokenResponse {
    access_token: String,
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenInfoResponse {
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
struct GmailMessagesListResponse {
    messages: Option<Vec<GmailMessageId>>,
    resultSizeEstimate: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct GmailMessageId {
    id: String,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
struct GmailMessageResponse {
    snippet: Option<String>,
    payload: Option<GmailMessagePart>,
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
struct GmailMessagePart {
    mimeType: Option<String>,
    filename: Option<String>,
    headers: Option<Vec<GmailHeader>>,
    body: Option<GmailBody>,
    parts: Option<Vec<GmailMessagePart>>,
}

#[derive(Debug, Deserialize)]
struct GmailHeader {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct GmailBody {
    data: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiContent {
    parts: Option<Vec<GeminiPart>>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiGenerateContentResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Debug, Serialize)]
struct DashboardStats {
    orcamentos_ativos: u32,
    propostas_recebidas: u32,
    divergencias_nota: u32,
    transportadoras: u32,
}

#[derive(Debug, Serialize)]
struct OrcamentoRecenteItem {
    id: String,
    pedido: String,
    status: String,
    propostas: u32,
    data: String,
    transportadoras_preview: Vec<String>,
}

#[derive(Debug, Serialize)]
struct TransportadoraItem {
    id: String,
    nome: String,
    cnpj: String,
    telefone: String,
    email_orcamento: String,
    email_nota: String,
}

#[derive(Debug, Serialize)]
struct DashboardAlertaItem {
    id: String,
    orcamento_id: String,
    transportadora: String,
    transportadora_id: Option<String>,
    msg: String,
    severity: String,
}

#[derive(Debug, Serialize)]
struct TransportadoraMetricas {
    total_transacoes: u32,
    transacoes_com_divergencia: u32,
    taxa_divergencia_pct: f64,
    valor_medio_proposta: f64,
    valor_medio_frete_pago: f64,
    divergencia_media: f64,
}

#[derive(Debug, Serialize)]
struct PropostaDetalheItem {
    id: String,
    valor_proposta: f64,
    valor_frete_pago: Option<f64>,
    prazo_entrega: Option<i32>,
    transportadora_id: Option<String>,
    transportadora_nome: Option<String>,
    data_proposta: String,
}

#[derive(Debug, Serialize)]
struct OrcamentoDetalheItem {
    id: String,
    descricao: String,
    numero_cotacao: Option<String>,
    data_criacao: String,
    ativo: bool,
    cnpj_pagador: Option<String>,
    cnpj_cpf_destino: Option<String>,
    cep_destino: Option<String>,
    logradouro_destino: Option<String>,
    numero_destino: Option<String>,
    complemento_destino: Option<String>,
    bairro_destino: Option<String>,
    cidade_destino: Option<String>,
    uf_destino: Option<String>,
    endereco_destino: Option<String>,
    nota: Option<String>,
    valor_produto: Option<f64>,
    qtd_volumes: Option<u32>,
    volumes: Option<Vec<db::models::Volume>>,
    dimensoes: Option<db::models::Dimensoes>,
    peso: Option<f64>,
    transportadoras_enviadas: Vec<String>,
    proposta_ganhadora_id: Option<String>,
    propostas: Vec<PropostaDetalheItem>,
    divergencia_tratada: bool,
    divergencia_email_status: String,
    divergencia_campos: Vec<String>,
    divergencia_campos_aceitos: Vec<String>,
    divergencia_email_correcao: Option<String>,
    divergencia_email_enviado_em: Option<String>,
}

fn status_orcamento(orcamento: &db::models::Orcamento) -> String {
    if !orcamento.ativo {
        if orcamento.proposta_ganhadora_id.is_some() {
            return "Concluído".to_string();
        }
        return "Encerrado".to_string();
    }

    // Ativo + ganhadora definida → aguardando nota para comparação
    if orcamento.proposta_ganhadora_id.is_some() {
        // Se já tem valor_frete_pago preenchido na ganhadora, comparação feita
        let ganhadora_id = orcamento.proposta_ganhadora_id.as_deref().unwrap_or("");
        let ganhadora_com_nota = orcamento.propostas.iter().any(|p| {
            p.id.as_deref() == Some(ganhadora_id) && p.valor_frete_pago.is_some()
        });
        if ganhadora_com_nota {
            return "Nota Recebida".to_string();
        }
        return "Aguardando Nota".to_string();
    }

    if orcamento.propostas.is_empty() {
        return "Aguardando".to_string();
    }

    "Em Análise".to_string()
}

fn transportadoras_preview_for_orcamento(
    orcamento: &db::models::Orcamento,
    transportadora_nome_por_id: &HashMap<mongodb::bson::oid::ObjectId, String>,
) -> Vec<String> {
    orcamento
        .propostas
        .iter()
        .filter_map(|proposta| proposta.transportadora_id.as_ref())
        .filter_map(|id| transportadora_nome_por_id.get(id))
        .take(3)
        .cloned()
        .collect()
}

#[allow(dead_code)]
fn parse_optional_object_id(value: Option<String>) -> Result<Option<mongodb::bson::oid::ObjectId>, String> {
    match value {
        Some(raw) if !raw.trim().is_empty() => mongodb::bson::oid::ObjectId::parse_str(raw.trim())
            .map(Some)
            .map_err(|e| format!("ID inválido: {}", e)),
        _ => Ok(None),
    }
}

async fn map_orcamento_to_detalhe(
    database: &db::Database,
    orcamento: db::models::Orcamento,
) -> Result<OrcamentoDetalheItem, String> {
    let mut transportadoras_cursor = database
        .transportadoras
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadora_nome_por_id: HashMap<mongodb::bson::oid::ObjectId, String> = HashMap::new();

    while transportadoras_cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar transportadoras: {}", e))?
    {
        let transportadora: db::models::Transportadora = transportadoras_cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar transportadora: {}", e))?;

        if let Some(id) = transportadora.id {
            transportadora_nome_por_id.insert(id, transportadora.nome);
        }
    }

    let id = orcamento
        .id
        .map(|value| value.to_hex())
        .ok_or_else(|| "Orçamento sem _id".to_string())?;

    let propostas = orcamento
        .propostas
        .into_iter()
        .enumerate()
        .map(|(index, proposta)| {
            let proposta_id = proposta
                .id
                .clone()
                .unwrap_or_else(|| format!("proposta-{}", index));

            let transportadora_nome = proposta
                .transportadora_id
                .as_ref()
                .and_then(|oid| transportadora_nome_por_id.get(oid).cloned());

            PropostaDetalheItem {
                id: proposta_id,
                valor_proposta: proposta.valor_proposta,
                valor_frete_pago: proposta.valor_frete_pago,
                prazo_entrega: proposta.prazo_entrega,
                transportadora_id: proposta.transportadora_id.map(|oid| oid.to_hex()),
                transportadora_nome,
                data_proposta: proposta.data_proposta,
            }
        })
        .collect();

    Ok(OrcamentoDetalheItem {
        id,
        descricao: orcamento.descricao,
        numero_cotacao: orcamento.numero_cotacao,
        data_criacao: orcamento.data_criacao,
        ativo: orcamento.ativo,
        cnpj_pagador: orcamento.cnpj_pagador,
        cnpj_cpf_destino: orcamento.cnpj_cpf_destino,
        cep_destino: orcamento.cep_destino,
        logradouro_destino: orcamento.logradouro_destino,
        numero_destino: orcamento.numero_destino,
        complemento_destino: orcamento.complemento_destino,
        bairro_destino: orcamento.bairro_destino,
        cidade_destino: orcamento.cidade_destino,
        uf_destino: orcamento.uf_destino,
        endereco_destino: orcamento.endereco_destino,
        nota: orcamento.nota,
        valor_produto: orcamento.valor_produto,
        qtd_volumes: orcamento.qtd_volumes,
        volumes: orcamento.volumes,
        dimensoes: orcamento.dimensoes,
        peso: orcamento.peso,
        proposta_ganhadora_id: orcamento.proposta_ganhadora_id,
        propostas,
        transportadoras_enviadas: orcamento.transportadoras_enviadas,
        divergencia_tratada: orcamento.divergencia_tratada,
        divergencia_email_status: orcamento.divergencia_email_status,
        divergencia_campos: orcamento.divergencia_campos,
        divergencia_campos_aceitos: orcamento.divergencia_campos_aceitos,
        divergencia_email_correcao: orcamento.divergencia_email_correcao,
        divergencia_email_enviado_em: orcamento.divergencia_email_enviado_em,
    })
}

async fn parse_google_response<T: DeserializeOwned>(
    response: reqwest::Response,
    contexto: &str,
) -> Result<T, String> {
    let status = response.status();
    let body = response.text().await.unwrap_or_else(|_| String::new());

    if !status.is_success() {
        let mut detalhe = body.clone();

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            let message = json
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(|message| message.as_str())
                .unwrap_or("");

            if !message.is_empty() {
                detalhe = message.to_string();
            }
        }

        if detalhe.contains("insufficientPermissions")
            || detalhe.contains("Request had insufficient authentication scopes")
            || detalhe.contains("Insufficient Permission")
        {
            return Err(format!(
                "{} ({}): {}. Dica: gere um novo GOOGLE_REFRESH_TOKEN com escopo https://www.googleapis.com/auth/gmail.readonly e confirme que o usuário está autorizado na tela de consentimento.",
                contexto,
                status,
                detalhe
            ));
        }

        return Err(format!("{} ({}): {}", contexto, status, detalhe));
    }

    serde_json::from_str::<T>(&body)
        .map_err(|e| format!("{}: resposta JSON inválida ({})", contexto, e))
}

fn decode_gmail_body(data: &str) -> Option<String> {
    let decoded = URL_SAFE_NO_PAD.decode(data).ok()?;
    String::from_utf8(decoded).ok()
}

fn extract_plain_text_body(part: &GmailMessagePart) -> Option<String> {
    let is_attachment = part
        .filename
        .as_ref()
        .map(|filename| !filename.is_empty())
        .unwrap_or(false);

    if !is_attachment && part.mimeType.as_deref() == Some("text/plain") {
        if let Some(data) = part.body.as_ref().and_then(|body| body.data.as_ref()) {
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
        if let Some(data) = part.body.as_ref().and_then(|body| body.data.as_ref()) {
            return decode_gmail_body(data);
        }
    }

    None
}

fn get_header_value(headers: Option<&Vec<GmailHeader>>, header_name: &str) -> Option<String> {
    headers.and_then(|list| {
        list.iter()
            .find(|header| header.name.eq_ignore_ascii_case(header_name))
            .map(|header| header.value.clone())
    })
}

fn get_non_empty_env(var_name: &str) -> Option<String> {
    std::env::var(var_name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn resolve_gemini_api_key() -> Option<String> {
    get_non_empty_env("GEMINI_API_KEY")
        .or_else(|| get_non_empty_env("GEMINI_API_LEY"))
        .or_else(|| get_non_empty_env("gemini_api_key"))
        .or_else(|| get_non_empty_env("gemini_api_ley"))
        // Fallback: valor embutido em tempo de compilação pela CI
        .or_else(|| option_env!("GEMINI_API_KEY").map(|s| s.to_string()))
}

fn has_gmail_read_scope(scopes: &str) -> bool {
    let valid_scopes = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.metadata",
        "https://mail.google.com/",
    ];

    scopes
        .split_whitespace()
        .any(|scope| valid_scopes.iter().any(|valid| valid == &scope))
}

async fn get_google_access_token_scopes(
    http: &reqwest::Client,
    access_token: &str,
) -> Result<Option<String>, String> {
    let response = http
        .get("https://www.googleapis.com/oauth2/v1/tokeninfo")
        .query(&[("access_token", access_token)])
        .send()
        .await
        .map_err(|e| format!("Erro ao validar escopos do access token: {}", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let info = response
        .json::<GoogleTokenInfoResponse>()
        .await
        .map_err(|e| format!("Erro ao ler escopos do access token: {}", e))?;

    Ok(info.scope)
}

#[tauri::command]
async fn get_gmail_inbox_status() -> Result<GmailInboxStatus, String> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("GOOGLE_CLIENT_ID").map(|s| s.to_string()))
        .ok_or_else(|| "GOOGLE_CLIENT_ID não definido".to_string())?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .ok()
        .or_else(|| option_env!("GOOGLE_CLIENT_SECRET").map(|s| s.to_string()))
        .ok_or_else(|| "GOOGLE_CLIENT_SECRET não definido".to_string())?;

    // Usar token do auth state (login) com fallback para env var
    let refresh_token = {
        let auth = google_auth::get_global_auth_state();
        let guard = auth.lock().await;
        guard.get_refresh_token()
    }
    .ok_or_else(|| "Nenhum token de autenticação. Faça login com sua conta Google.".to_string())?;

    let http = reqwest::Client::new();

    let token = http
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

    let token = parse_google_response::<GmailTokenResponse>(token, "Erro de autenticação no Google").await?;

    let scopes = if let Some(scopes) = token.scope.as_deref() {
        Some(scopes.to_string())
    } else {
        get_google_access_token_scopes(&http, &token.access_token).await?
    };

    if let Some(scopes) = scopes.as_deref() {
        if !has_gmail_read_scope(scopes) {
            return Err(format!(
                "GOOGLE_REFRESH_TOKEN atual não possui permissão para inbox. Escopos atuais: {}. Use um refresh token do mesmo usuário com escopo https://www.googleapis.com/auth/gmail.readonly ou https://www.googleapis.com/auth/gmail.send.",
                scopes
            ));
        }
    }

    let inbox_list = http
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .query(&[("labelIds", "INBOX"), ("maxResults", "1")])
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Erro ao listar inbox: {}", e))?;

    let inbox_list = parse_google_response::<GmailMessagesListResponse>(inbox_list, "Erro na listagem da inbox").await?;

    let unread_list = http
        .get("https://gmail.googleapis.com/gmail/v1/users/me/messages")
        .query(&[("labelIds", "INBOX"), ("labelIds", "UNREAD"), ("maxResults", "1")])
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Erro ao listar não lidos: {}", e))?;

    let unread_list = parse_google_response::<GmailMessagesListResponse>(unread_list, "Erro na listagem de não lidos").await?;

    let total_emails = inbox_list.resultSizeEstimate.unwrap_or(0);
    let nao_lidos = unread_list.resultSizeEstimate.unwrap_or(0);

    let latest_message_id = inbox_list
        .messages
        .as_ref()
        .and_then(|messages| messages.first())
        .map(|message| message.id.clone());

    if latest_message_id.is_none() {
        return Ok(GmailInboxStatus {
            total_emails,
            nao_lidos,
            assunto_mais_novo: None,
            de_mais_novo: None,
            corpo_mais_novo: None,
        });
    }

    let message_url = format!(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}",
        latest_message_id.unwrap_or_default()
    );

    let message = http
        .get(message_url)
        .query(&[("format", "full")])
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|e| format!("Erro ao buscar email mais novo: {}", e))?;

    let message = parse_google_response::<GmailMessageResponse>(message, "Erro ao obter email mais novo").await?;

    let assunto_mais_novo = message
        .payload
        .as_ref()
        .and_then(|payload| get_header_value(payload.headers.as_ref(), "Subject"));
    let de_mais_novo = message
        .payload
        .as_ref()
        .and_then(|payload| get_header_value(payload.headers.as_ref(), "From"));
    let corpo_mais_novo = message
        .payload
        .as_ref()
        .and_then(extract_plain_text_body)
        .or(message.snippet);

    Ok(GmailInboxStatus {
        total_emails,
        nao_lidos,
        assunto_mais_novo,
        de_mais_novo,
        corpo_mais_novo,
    })
}

#[tauri::command]
async fn call_gemini_api(prompt: String) -> Result<String, String> {
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Prompt não pode ser vazio".to_string());
    }

    let api_key = resolve_gemini_api_key()
        .ok_or_else(|| "GEMINI_API_KEY não definida no .env".to_string())?;

    let http = reqwest::Client::new();
    let response = http
        .post("https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent")
        .query(&[("key", api_key.as_str())])
        .json(&serde_json::json!({
            "contents": [
                {
                    "parts": [
                        { "text": prompt }
                    ]
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| format!("Erro ao chamar Gemini API: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Erro ao ler resposta da Gemini API: {}", e))?;

    if !status.is_success() {
        return Err(format!("Gemini API retornou {}: {}", status, body));
    }

    let parsed: GeminiGenerateContentResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta inválida da Gemini API: {}", e))?;

    let texto = parsed
        .candidates
        .as_ref()
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.content.as_ref())
        .and_then(|content| content.parts.as_ref())
        .and_then(|parts| {
            parts
                .iter()
                .filter_map(|part| part.text.as_ref())
                .find(|text| !text.trim().is_empty())
        })
        .map(|text| text.to_string())
        .ok_or_else(|| "Gemini API não retornou texto na resposta".to_string())?;

    Ok(texto)
}

#[tauri::command]
async fn get_dashboard_stats() -> Result<DashboardStats, String> {
    let database = db::get_database().await?;

    let mut cursor = database
        .orcamentos
        .find(mongodb::bson::doc! { "ativo": true })
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos ativos: {}", e))?;

    let mut orcamentos_ativos: u32 = 0;
    let mut propostas_recebidas: u32 = 0;
    let mut divergencias_nota: u32 = 0;

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar orçamentos ativos: {}", e))?
    {
        let orcamento = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;

        orcamentos_ativos = orcamentos_ativos.saturating_add(1);
        propostas_recebidas = propostas_recebidas.saturating_add(orcamento.propostas.len() as u32);

        let divergencias_do_orcamento = orcamento
            .propostas
            .iter()
            .filter(|proposta| {
                proposta
                    .valor_frete_pago
                    .map(|valor_frete_pago| (valor_frete_pago - proposta.valor_proposta).abs() > f64::EPSILON)
                    .unwrap_or(false)
            })
            .count() as u32;

        divergencias_nota = divergencias_nota.saturating_add(divergencias_do_orcamento);
    }

    let transportadoras = database
        .transportadoras
        .count_documents(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao contar transportadoras: {}", e))?;

    Ok(DashboardStats {
        orcamentos_ativos,
        propostas_recebidas,
        divergencias_nota,
        transportadoras: transportadoras as u32,
    })
}

#[tauri::command]
async fn get_orcamentos_recentes(limit: u32, include_inactive: Option<bool>) -> Result<Vec<OrcamentoRecenteItem>, String> {
    let database = db::get_database().await?;
    let limit = limit.max(1);
    let include_inactive = include_inactive.unwrap_or(false);

    let mut transportadoras_cursor = database
        .transportadoras
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadora_nome_por_id: HashMap<mongodb::bson::oid::ObjectId, String> = HashMap::new();

    while transportadoras_cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar transportadoras: {}", e))?
    {
        let transportadora: db::models::Transportadora = transportadoras_cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar transportadora: {}", e))?;

        if let Some(id) = transportadora.id {
            transportadora_nome_por_id.insert(id, transportadora.nome);
        }
    }

    let filter = if include_inactive {
        mongodb::bson::doc! {}
    } else {
        mongodb::bson::doc! { "ativo": true }
    };

    let options = mongodb::options::FindOptions::builder()
        .sort(mongodb::bson::doc! { "data_criacao": -1 })
        .limit(i64::from(limit))
        .build();

    let mut cursor = database
        .orcamentos
        .find(filter)
        .with_options(options)
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos recentes: {}", e))?;

    let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar orçamentos recentes: {}", e))?
    {
        let orcamento = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
        let status = status_orcamento(&orcamento);
        let transportadoras_preview = transportadoras_preview_for_orcamento(
            &orcamento,
            &transportadora_nome_por_id,
        );

        itens.push(OrcamentoRecenteItem {
            id: orcamento
                .id
                .as_ref()
                .map(|oid| oid.to_hex())
                .unwrap_or_default(),
            pedido: orcamento.descricao.clone(),
            status,
            propostas: orcamento.propostas.len() as u32,
            data: orcamento.data_criacao.clone(),
            transportadoras_preview,
        });
    }

    Ok(itens)
}

#[tauri::command]
async fn get_dashboard_alertas(limit: u32) -> Result<Vec<DashboardAlertaItem>, String> {
    let database = db::get_database().await?;
    let limit = limit.max(1) as usize;

    let mut transportadoras_cursor = database
        .transportadoras
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadora_nome_por_id: HashMap<mongodb::bson::oid::ObjectId, String> = HashMap::new();

    while transportadoras_cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar transportadoras: {}", e))?
    {
        let transportadora: db::models::Transportadora = transportadoras_cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar transportadora: {}", e))?;

        if let Some(id) = transportadora.id {
            transportadora_nome_por_id.insert(id, transportadora.nome);
        }
    }

    let options = mongodb::options::FindOptions::builder()
        .sort(mongodb::bson::doc! { "data_criacao": -1 })
        .build();

    let mut orcamentos_cursor = database
        .orcamentos
        .find(mongodb::bson::doc! { "ativo": true, "divergencia_tratada": { "$ne": true } })
        .with_options(options)
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos ativos: {}", e))?;

    let mut alertas: Vec<DashboardAlertaItem> = Vec::new();

    while orcamentos_cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar orçamentos ativos: {}", e))?
    {
        let orcamento: db::models::Orcamento = orcamentos_cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;

        let orcamento_id = orcamento
            .id
            .as_ref()
            .map(|oid| oid.to_hex())
            .unwrap_or_else(|| "sem-id".to_string());

        for (indice, proposta) in orcamento.propostas.iter().enumerate() {
            let Some(valor_frete_pago) = proposta.valor_frete_pago else {
                continue;
            };

            if (valor_frete_pago - proposta.valor_proposta).abs() < f64::EPSILON {
                continue;
            }

            let transportadora = proposta
                .transportadora_id
                .as_ref()
                .and_then(|id| transportadora_nome_por_id.get(id))
                .cloned()
                .unwrap_or_else(|| "Transportadora não identificada".to_string());

            alertas.push(DashboardAlertaItem {
                id: format!("{}-{}", orcamento_id, indice),
                orcamento_id: orcamento_id.clone(),
                transportadora,
                transportadora_id: proposta.transportadora_id.as_ref().map(|oid| oid.to_hex()),
                msg: format!(
                    "Divergência: frete pago R$ {} vs proposta R$ {}",
                    valor_frete_pago, proposta.valor_proposta
                ),
                severity: "error".to_string(),
            });

            if alertas.len() >= limit {
                return Ok(alertas);
            }
        }

        // Alerta por divergência de peso (ou outros campos) detectada automaticamente
        // Ativa quando divergencia_campos tem entradas mas não havia divergência de valor nas propostas
        let ja_tem_alerta = alertas.iter().any(|a| a.orcamento_id == orcamento_id);
        if !ja_tem_alerta && !orcamento.divergencia_campos.is_empty() {
            let transportadora = orcamento
                .propostas
                .iter()
                .find(|p| orcamento.proposta_ganhadora_id.as_deref() == p.id.as_deref())
                .and_then(|p| p.transportadora_id.as_ref())
                .and_then(|id| transportadora_nome_por_id.get(id))
                .cloned()
                .unwrap_or_else(|| "Transportadora não identificada".to_string());

            alertas.push(DashboardAlertaItem {
                id: format!("{}-campos", orcamento_id),
                orcamento_id: orcamento_id.clone(),
                transportadora,
                transportadora_id: orcamento
                    .propostas
                    .iter()
                    .find(|p| orcamento.proposta_ganhadora_id.as_deref() == p.id.as_deref())
                    .and_then(|p| p.transportadora_id.as_ref())
                    .map(|oid| oid.to_hex()),
                msg: format!("Divergência: {}", orcamento.divergencia_campos.join(" | ")),
                severity: "error".to_string(),
            });

            if alertas.len() >= limit {
                return Ok(alertas);
            }
        }
    }

    Ok(alertas)
}

#[tauri::command]
async fn get_transportadora_metricas(transportadora_id: String) -> Result<TransportadoraMetricas, String> {
    let database = db::get_database().await?;
    let transportadora_oid = mongodb::bson::oid::ObjectId::parse_str(&transportadora_id)
        .map_err(|e| format!("ID de transportadora inválido: {}", e))?;

    let mut cursor = database
        .orcamentos
        .find(mongodb::bson::doc! { "propostas.transportadora_id": transportadora_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

    let mut total_transacoes: u32 = 0;
    let mut transacoes_com_divergencia: u32 = 0;
    let mut soma_proposta: f64 = 0.0;
    let mut soma_frete_pago: f64 = 0.0;
    let mut soma_divergencia: f64 = 0.0;
    let mut count_frete_pago: u32 = 0;

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
    {
        let orcamento: db::models::Orcamento = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;

        for proposta in &orcamento.propostas {
            if proposta.transportadora_id.as_ref() != Some(&transportadora_oid) {
                continue;
            }
            total_transacoes = total_transacoes.saturating_add(1);
            soma_proposta += proposta.valor_proposta;

            if let Some(frete_pago) = proposta.valor_frete_pago {
                count_frete_pago = count_frete_pago.saturating_add(1);
                soma_frete_pago += frete_pago;
                let diff = (frete_pago - proposta.valor_proposta).abs();
                if (frete_pago - proposta.valor_proposta).abs() > f64::EPSILON {
                    transacoes_com_divergencia = transacoes_com_divergencia.saturating_add(1);
                    soma_divergencia += diff;
                }
            }
        }
    }

    let taxa_divergencia_pct = if total_transacoes > 0 {
        (transacoes_com_divergencia as f64 / total_transacoes as f64) * 100.0
    } else {
        0.0
    };

    // Values are already stored in reais (f64), no conversion needed
    let valor_medio_proposta = if total_transacoes > 0 {
        soma_proposta / total_transacoes as f64
    } else {
        0.0
    };

    let valor_medio_frete_pago = if count_frete_pago > 0 {
        soma_frete_pago / count_frete_pago as f64
    } else {
        0.0
    };

    let divergencia_media = if transacoes_com_divergencia > 0 {
        soma_divergencia / transacoes_com_divergencia as f64
    } else {
        0.0
    };

    Ok(TransportadoraMetricas {
        total_transacoes,
        transacoes_com_divergencia,
        taxa_divergencia_pct,
        valor_medio_proposta,
        valor_medio_frete_pago,
        divergencia_media,
    })
}

#[derive(Debug, Serialize)]
struct NotificacaoItem {
    id: String,
    orcamento_id: String,
    orcamento_descricao: String,
    mensagem: String,
    lida: bool,
    criada_em: String,
}

#[tauri::command]
async fn marcar_divergencia_tratada(orcamento_id: String, tratada: bool) -> Result<(), String> {
    let database = db::get_database().await?;
    let oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID inválido: {}", e))?;

    database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": oid },
            mongodb::bson::doc! { "$set": { "divergencia_tratada": tratada } },
        )
        .await
        .map_err(|e| format!("Erro ao atualizar divergencia_tratada: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn migrar_divergencia_tratada() -> Result<u32, String> {
    let database = db::get_database().await?;

    // Apenas documentos que ainda não possuem o campo (migração única)
    let filtro_sem_campo = mongodb::bson::doc! { "divergencia_tratada": { "$exists": false } };

    let mut cursor = database
        .orcamentos
        .find(filtro_sem_campo)
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

    let mut atualizados: u32 = 0;

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro cursor: {}", e))?
    {
        let orc: db::models::Orcamento = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro desserializar: {}", e))?;

        let orc_id = match orc.id {
            Some(id) => id,
            None => continue,
        };

        // Para registros sem o campo, inicializa como false (divergência pendente)
        // O usuário poderá marcar como tratada manualmente depois
        database
            .orcamentos
            .update_one(
                mongodb::bson::doc! { "_id": orc_id, "divergencia_tratada": { "$exists": false } },
                mongodb::bson::doc! { "$set": { "divergencia_tratada": false } },
            )
            .await
            .map_err(|e| format!("Erro ao atualizar: {}", e))?;

        atualizados += 1;
    }

    Ok(atualizados)
}

#[tauri::command]
async fn sync_notificacoes_divergencias() -> Result<u32, String> {
    let database = db::get_database().await?;

    let mut cursor_notif = database
        .notificacoes
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar notificacoes: {}", e))?;

    let mut orcamentos_com_notif: std::collections::HashSet<String> = std::collections::HashSet::new();
    while cursor_notif
        .advance()
        .await
        .map_err(|e| format!("Erro cursor notificacoes: {}", e))?
    {
        let n: db::models::Notificacao = cursor_notif
            .deserialize_current()
            .map_err(|e| format!("Erro desserializar: {}", e))?;
        orcamentos_com_notif.insert(n.orcamento_id.to_hex());
    }

    let mut cursor_orc = database
        .orcamentos
        .find(mongodb::bson::doc! { "ativo": true })
        .await
        .map_err(|e| format!("Erro ao buscar orcamentos: {}", e))?;

    let mut criadas: u32 = 0;
    let agora = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    while cursor_orc
        .advance()
        .await
        .map_err(|e| format!("Erro cursor orcamentos: {}", e))?
    {
        let orc: db::models::Orcamento = cursor_orc
            .deserialize_current()
            .map_err(|e| format!("Erro desserializar: {}", e))?;

        let orc_id = match orc.id {
            Some(id) => id,
            None => continue,
        };

        if orcamentos_com_notif.contains(&orc_id.to_hex()) {
            continue;
        }

        for proposta in &orc.propostas {
            let Some(pago) = proposta.valor_frete_pago else {
                continue;
            };
            if (pago - proposta.valor_proposta).abs() < f64::EPSILON {
                continue;
            }
            let notif = db::models::Notificacao {
                id: None,
                orcamento_id: orc_id,
                orcamento_descricao: orc.descricao.clone(),
                mensagem: format!(
                    "Divergencia de nota detectada: frete pago R$ {:.2} vs proposta R$ {:.2}",
                    pago,
                    proposta.valor_proposta
                ),
                lida: false,
                criada_em: agora.clone(),
            };
            let _ = database.notificacoes.insert_one(notif).await;
            orcamentos_com_notif.insert(orc_id.to_hex());
            criadas += 1;
            break;
        }
    }

    Ok(criadas)
}

#[tauri::command]
async fn get_notificacoes() -> Result<Vec<NotificacaoItem>, String> {
    let database = db::get_database().await?;

    // Buscar IDs dos orçamentos ativos
    let mut cursor_orc = database
        .orcamentos
        .find(mongodb::bson::doc! { "ativo": true })
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

    let mut orcamentos_ativos_ids: Vec<mongodb::bson::oid::ObjectId> = Vec::new();
    while cursor_orc
        .advance()
        .await
        .map_err(|e| format!("Erro cursor orçamentos: {}", e))?
    {
        let orc: db::models::Orcamento = cursor_orc
            .deserialize_current()
            .map_err(|e| format!("Erro desserializar: {}", e))?;
        if let Some(id) = orc.id {
            orcamentos_ativos_ids.push(id);
        }
    }

    if orcamentos_ativos_ids.is_empty() {
        return Ok(vec![]);
    }

    // Buscar notificações apenas dos orçamentos ativos, mais recentes primeiro
    let options = mongodb::options::FindOptions::builder()
        .sort(mongodb::bson::doc! { "criada_em": -1 })
        .build();

    let mut cursor = database
        .notificacoes
        .find(mongodb::bson::doc! {
            "orcamento_id": { "$in": &orcamentos_ativos_ids }
        })
        .with_options(options)
        .await
        .map_err(|e| format!("Erro ao buscar notificações: {}", e))?;

    let mut items: Vec<NotificacaoItem> = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro cursor notificações: {}", e))?
    {
        let n: db::models::Notificacao = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro desserializar notificação: {}", e))?;
        items.push(NotificacaoItem {
            id: n.id.map(|oid| oid.to_hex()).unwrap_or_default(),
            orcamento_id: n.orcamento_id.to_hex(),
            orcamento_descricao: n.orcamento_descricao,
            mensagem: n.mensagem,
            lida: n.lida,
            criada_em: n.criada_em,
        });
    }

    Ok(items)
}

#[tauri::command]
async fn marcar_notificacao_lida(notificacao_id: String) -> Result<(), String> {
    let database = db::get_database().await?;
    let oid = mongodb::bson::oid::ObjectId::parse_str(&notificacao_id)
        .map_err(|e| format!("ID inválido: {}", e))?;

    database
        .notificacoes
        .update_one(
            mongodb::bson::doc! { "_id": oid },
            mongodb::bson::doc! { "$set": { "lida": true } },
        )
        .await
        .map_err(|e| format!("Erro ao marcar lida: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn excluir_notificacao(notificacao_id: String) -> Result<(), String> {
    let database = db::get_database().await?;
    let oid = mongodb::bson::oid::ObjectId::parse_str(&notificacao_id)
        .map_err(|e| format!("ID inválido: {}", e))?;

    database
        .notificacoes
        .delete_one(mongodb::bson::doc! { "_id": oid })
        .await
        .map_err(|e| format!("Erro ao excluir notificação: {}", e))?;

    Ok(())
}

#[tauri::command]
fn set_tray_divergencias(app: tauri::AppHandle, count: u32) -> Result<String, String> {
    let tooltip = match count {
        0 => "Ultimax - Monitor de Fretes".to_string(),
        1 => "Ultimax - Monitor de Fretes - 1 nova notificação".to_string(),
        n => format!("Ultimax - Monitor de Fretes - {} novas notificações", n),
    };

    // Em Tauri 2, iteramos sobre os tray icons disponíveis
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }

    Ok("ok".to_string())
}

#[tauri::command]
async fn add_orcamento(mut orcamento: db::models::Orcamento) -> Result<String, String> {
    let database = db::get_database().await?;  
    orcamento.id = None;
    orcamento.ativo = true;
    orcamento.proposta_ganhadora_id = None;

    // Derive descricao from nota and numero_cotacao if provided
    let nota = orcamento.nota.as_deref().unwrap_or("").trim().to_string();
    let nc = orcamento.numero_cotacao.as_deref().unwrap_or("").trim().to_string();
    if !nota.is_empty() || !nc.is_empty() {
        orcamento.descricao = format!("NF:{} / COT:{}", nota, nc);
    } else if orcamento.descricao.trim().is_empty() {
        return Err("Informe pelo menos a Nota ou Número de Cotação.".to_string());
    }

    if orcamento.qtd_volumes.is_none() {
        if let Some(volumes) = &orcamento.volumes {
            if !volumes.is_empty() {
                orcamento.qtd_volumes = Some(volumes.len() as u32);
            }
        }
    }

    let insert_result = database
        .orcamentos
        .insert_one(orcamento)
        .await
        .map_err(|e| format!("Erro ao salvar orçamento: {}", e))?;

    insert_result
        .inserted_id
        .as_object_id()
        .map(|oid| oid.to_hex())
        .ok_or_else(|| "Orçamento salvo, mas não foi possível obter o ID".to_string())
}

#[tauri::command]
async fn add_proposta(orcamento_id: String, proposta: db::models::Proposta) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    if !orcamento.ativo {
        return Err("Orçamento está desativado e não aceita novas propostas".to_string());
    }

    let mut proposta = proposta;
    if proposta.id.as_ref().map(|id| id.trim().is_empty()).unwrap_or(true) {
        proposta.id = Some(mongodb::bson::oid::ObjectId::new().to_hex());
    }

    orcamento
        .adicionar_proposta(proposta)
        .map_err(|e| format!("Erro ao adicionar proposta: {}", e))?;

    let update_result = database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao atualizar orçamento: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    Ok("Proposta adicionada com sucesso".to_string())
}

#[tauri::command]
async fn add_transportadora(transportadora: db::models::Transportadora) -> Result<String, String> {
    let database = db::get_database().await?;
    let mut nova_transportadora = transportadora.clone();
    nova_transportadora.id = None;

    database
        .transportadoras
        .insert_one(nova_transportadora)
        .await
        .map_err(|e| format!("Erro ao salvar transportadora: {}", e))?;

    Ok("Transportadora adicionada com sucesso".to_string())
}

#[tauri::command]
async fn update_transportadora(
    transportadora_id: String,
    transportadora: db::models::Transportadora,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let transportadora_oid = mongodb::bson::oid::ObjectId::parse_str(&transportadora_id)
        .map_err(|e| format!("ID de transportadora inválido: {}", e))?;

    let mut updated = transportadora.clone();
    updated.id = Some(transportadora_oid);

    let update_result = database
        .transportadoras
        .replace_one(mongodb::bson::doc! { "_id": transportadora_oid }, &updated)
        .await
        .map_err(|e| format!("Erro ao atualizar transportadora: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Transportadora não encontrada".to_string());
    }

    Ok("Transportadora atualizada com sucesso".to_string())
}

#[tauri::command]
async fn delete_transportadora(transportadora_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let transportadora_oid = mongodb::bson::oid::ObjectId::parse_str(&transportadora_id)
        .map_err(|e| format!("ID de transportadora inválido: {}", e))?;

    let delete_result = database
        .transportadoras
        .delete_one(mongodb::bson::doc! { "_id": transportadora_oid })
        .await
        .map_err(|e| format!("Erro ao excluir transportadora: {}", e))?;

    if delete_result.deleted_count == 0 {
        return Err("Transportadora não encontrada".to_string());
    }

    Ok("Transportadora excluída com sucesso".to_string())
}

#[tauri::command]
async fn get_orcamento(orcamento_id: String) -> Result<db::models::Orcamento, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())
}

#[tauri::command]
async fn get_orcamento_detalhe(orcamento_id: String) -> Result<OrcamentoDetalheItem, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    map_orcamento_to_detalhe(&database, orcamento).await
}

#[tauri::command]
async fn update_orcamento_basico(
    orcamento_id: String,
    descricao: Option<String>,
    numero_cotacao: Option<String>,
    data_criacao: String,
    cnpj_pagador: Option<String>,
    cnpj_cpf_destino: Option<String>,
    cep_destino: Option<String>,
    logradouro_destino: Option<String>,
    numero_destino: Option<String>,
    complemento_destino: Option<String>,
    bairro_destino: Option<String>,
    cidade_destino: Option<String>,
    uf_destino: Option<String>,
    endereco_destino: Option<String>,
    nota: Option<String>,
    valor_produto: Option<f64>,
    qtd_volumes: Option<u32>,
    volumes: Option<Vec<db::models::Dimensoes>>,
    dimensoes: Option<db::models::Dimensoes>,
    peso: Option<f64>,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let data_criacao = data_criacao.trim();
    if data_criacao.is_empty() {
        return Err("Data de criação é obrigatória".to_string());
    }

    // Derive descricao from nota/numero_cotacao if provided
    let nn = nota.as_deref().unwrap_or("").trim().to_string();
    let nc = numero_cotacao.as_deref().unwrap_or("").trim().to_string();
    let descricao_final = if !nn.is_empty() || !nc.is_empty() {
        format!("NF:{} / COT:{}", nn, nc)
    } else {
        descricao.as_deref().unwrap_or("").trim().to_string()
    };

    if descricao_final.is_empty() {
        return Err("Informe pelo menos o Número de Nota ou Número de Cotação.".to_string());
    }

    let mut set_doc = mongodb::bson::Document::new();
    set_doc.insert("descricao", descricao_final.as_str());
    set_doc.insert("numero_cotacao", numero_cotacao.as_deref());
    set_doc.insert("data_criacao", data_criacao);
    set_doc.insert("cnpj_pagador", cnpj_pagador);
    set_doc.insert("cnpj_cpf_destino", cnpj_cpf_destino);
    set_doc.insert("cep_destino", cep_destino);
    set_doc.insert("logradouro_destino", logradouro_destino);
    set_doc.insert("numero_destino", numero_destino);
    set_doc.insert("complemento_destino", complemento_destino);
    set_doc.insert("bairro_destino", bairro_destino);
    set_doc.insert("cidade_destino", cidade_destino);
    set_doc.insert("uf_destino", uf_destino);
    set_doc.insert("endereco_destino", endereco_destino);
    set_doc.insert("nota", nota);
    set_doc.insert("valor_produto", valor_produto);
    let mut final_qtd_volumes = qtd_volumes;
    if final_qtd_volumes.is_none() {
        if let Some(vols) = &volumes {
            if !vols.is_empty() {
                final_qtd_volumes = Some(vols.len() as u32);
            }
        }
    }
    set_doc.insert("qtd_volumes", final_qtd_volumes);
    set_doc.insert("peso", peso);
    if let Some(qtd) = final_qtd_volumes {
        set_doc.insert("qtd_volumes", qtd);
    }
    if let Some(vols) = volumes.clone() {
        let bson_vols: Vec<mongodb::bson::Bson> = vols
            .into_iter()
            .map(|d| mongodb::bson::doc! { "comprimento": d.comprimento, "largura": d.largura, "altura": d.altura })
            .map(mongodb::bson::Bson::Document)
            .collect();
        set_doc.insert("volumes", bson_vols);
    } else {
        set_doc.insert("volumes", mongodb::bson::Bson::Null);
    }

    if let Some(d) = dimensoes {
        set_doc.insert(
            "dimensoes",
            mongodb::bson::doc! {
                "comprimento": d.comprimento,
                "largura": d.largura,
                "altura": d.altura,
            },
        );
    } else {
        set_doc.insert("dimensoes", mongodb::bson::Bson::Null);
    }

    let update_result = database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! { "$set": set_doc },
        )
        .await
        .map_err(|e| format!("Erro ao atualizar orçamento: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    Ok("Orçamento atualizado com sucesso".to_string())
}

#[tauri::command]
async fn add_proposta_manual(
    orcamento_id: String,
    valor_proposta: f64,
    transportadora_id: String,
    data_proposta: String,
    prazo_entrega: i32,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    if !orcamento.ativo {
        return Err("Orçamento está desativado e não aceita novas propostas".to_string());
    }

    let transportadora_oid = mongodb::bson::oid::ObjectId::parse_str(&transportadora_id)
        .map_err(|e| format!("ID de transportadora inválido: {}", e))?;

    if prazo_entrega <= 0 {
        return Err("Prazo de entrega deve ser um número de dias válido".to_string());
    }

    let nova_proposta = db::models::Proposta {
        id: Some(mongodb::bson::oid::ObjectId::new().to_hex()),
        valor_proposta,
        valor_frete_pago: None,
        prazo_entrega: Some(prazo_entrega),
        transportadora_id: Some(transportadora_oid),
        data_proposta,
        origem: "manual".to_string(),
    };

    orcamento
        .adicionar_proposta(nova_proposta)
        .map_err(|e| format!("Erro ao adicionar proposta: {}", e))?;

    let update_result = database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao atualizar orçamento: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    Ok("Proposta adicionada com sucesso".to_string())
}

#[tauri::command]
async fn registrar_nota_manual(
    orcamento_id: String,
    proposta_id: String,
    valor_frete_pago: f64,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    if !orcamento.ativo {
        return Err("Orçamento está desativado".to_string());
    }

    if valor_frete_pago <= 0.0 {
        return Err("O valor do frete pago deve ser maior que zero".to_string());
    }

    let ganhadora_id = orcamento
        .proposta_ganhadora_id
        .as_deref()
        .ok_or_else(|| "Este orçamento não possui proposta ganhadora definida".to_string())?
        .to_string();

    if ganhadora_id != proposta_id {
        return Err("Somente a proposta ganhadora pode ter o valor da nota registrado".to_string());
    }

    let proposta = orcamento
        .propostas
        .iter_mut()
        .find(|p| p.id.as_deref() == Some(proposta_id.as_str()))
        .ok_or_else(|| "Proposta não encontrada neste orçamento".to_string())?;

    proposta.valor_frete_pago = Some(valor_frete_pago);

    let update_result = database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao atualizar orçamento: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    Ok("Nota registrada manualmente com sucesso".to_string())
}

#[tauri::command]
async fn desativar_orcamento(orcamento_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let update_result = database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! {
                "$set": {
                    "ativo": false,
                }
            },
        )
        .await
        .map_err(|e| format!("Erro ao desativar orçamento: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado".to_string());
    }

    Ok("Orçamento desativado com sucesso".to_string())
}

#[tauri::command]
async fn reativar_orcamento(orcamento_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let update_result = database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! { "$set": { "ativo": true } },
        )
        .await
        .map_err(|e| format!("Erro ao reativar orçamento: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado".to_string());
    }

    Ok("Orçamento reativado com sucesso".to_string())
}

#[tauri::command]
async fn escolher_proposta_ganhadora(
    orcamento_id: String,
    proposta_id: String,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    let proposta_ganhadora = orcamento
        .propostas
        .iter()
        .find(|proposta| proposta.id.as_deref() == Some(proposta_id.as_str()))
        .cloned();

    if proposta_ganhadora.is_none() {
        return Err("Proposta informada não pertence a este orçamento".to_string());
    }

    let proposta_ganhadora = proposta_ganhadora.unwrap();
    orcamento.proposta_ganhadora_id = Some(proposta_id);
    // Orçamento permanece ativo — só conclui quando o usuário marcar manualmente

    let update_result = database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao definir proposta ganhadora: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    // Envia e-mail à transportadora vencedora solicitando dados de pagamento e nota fiscal
    if let Some(transportadora_id) = proposta_ganhadora.transportadora_id {
        match database
            .transportadoras
            .find_one(mongodb::bson::doc! { "_id": transportadora_id })
            .await
        {
            Ok(Some(transportadora)) => {
                let email_destino = if !transportadora.email_nota.trim().is_empty() {
                    transportadora.email_nota.trim().to_string()
                } else {
                    transportadora.email_orcamento.trim().to_string()
                };

                if !email_destino.is_empty() {
                    if let Ok(gmail) = gmail_client::GmailClient::authenticate().await {
                        let subject = format!(
                            "Proposta aceita — orçamento {} | Aguardamos dados de pagamento e nota fiscal",
                            orcamento.descricao
                        );
                        let body = format!(
                            "<p>Olá {},</p>\n\
                            <p>Temos o prazer de informar que sua proposta para o orçamento \"{}\" foi aceita.</p>\n\
                            <p>Para darmos continuidade ao processo, solicitamos que nos envie:</p>\n\
                            <ul>\n\
                              <li>Dados bancários para pagamento (banco, agência, conta, CNPJ/CPF e razão social)</li>\n\
                              <li>Nota fiscal referente ao frete (CT-e ou NF-e)</li>\n\
                            </ul>\n\
                            <p>Por favor, responda este e-mail com as informações acima o mais breve possível.</p>\n\
                            <p>Obrigado e aguardamos seu retorno.</p>",
                            transportadora.nome,
                            orcamento.descricao,
                        );
                        let _ = gmail.send_email(&email_destino, &subject, &body).await;
                    }
                }
            }
            Ok(None) | Err(_) => {
                // Transportadora não encontrada ou erro: não bloqueia o fluxo principal
            }
        }
    }

    Ok("Proposta ganhadora definida com sucesso".to_string())
}

#[tauri::command]
async fn desfazer_proposta_ganhadora(orcamento_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    orcamento.proposta_ganhadora_id = None;
    // Não muda ativo — o orçamento já está ativo

    let update_result = database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao desfazer proposta ganhadora: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    Ok("Proposta ganhadora desfeita com sucesso".to_string())
}

#[tauri::command]
async fn delete_proposta(orcamento_id: String, proposta_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    let index = orcamento
        .propostas
        .iter()
        .position(|proposta| proposta.id.as_deref() == Some(proposta_id.as_str()))
        .ok_or_else(|| "Proposta não encontrada neste orçamento".to_string())?;

    orcamento.propostas.remove(index);

    if orcamento.proposta_ganhadora_id.as_deref() == Some(proposta_id.as_str()) {
        orcamento.proposta_ganhadora_id = None;
        // Não muda ativo — o orçamento continua ativo
    }

    let update_result = database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao excluir proposta: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Orçamento não encontrado para atualização".to_string());
    }

    Ok("Proposta excluída com sucesso".to_string())
}

#[tauri::command]
async fn get_orcamentos(page: u32, page_size: u32) -> Result<Vec<db::models::Orcamento>, String> {
    let database = db::get_database().await?;
    let page = page.max(1);
    let page_size = page_size.max(1);
    let skip = u64::from(page.saturating_sub(1)) * u64::from(page_size);

    let options = mongodb::options::FindOptions::builder()
        .skip(skip)
        .limit(i64::from(page_size))
        .build();

    let mut cursor = database
        .orcamentos
        .find(mongodb::bson::doc! {})
        .with_options(options)
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

    let mut orcamentos: Vec<db::models::Orcamento> = Vec::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
    {
        let orcamento = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
        orcamentos.push(orcamento);
    }

    Ok(orcamentos)
}

#[tauri::command]
async fn get_transportadoras() -> Result<Vec<TransportadoraItem>, String> {
    let database = db::get_database().await?;  
    let mut cursor = database
        .transportadoras
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadoras: Vec<TransportadoraItem> = Vec::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar transportadoras: {}", e))?
    {
        let t = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar transportadora: {}", e))?;
        transportadoras.push(TransportadoraItem {
            id: t.id.map(|oid| oid.to_hex()).unwrap_or_default(),
            nome: t.nome,
            cnpj: t.cnpj,
            telefone: t.telefone,
            email_orcamento: t.email_orcamento,
            email_nota: t.email_nota,
        });
    }

    Ok(transportadoras)
}

#[tauri::command]
async fn send_orcamento_request_email(
    orcamento_id: Option<String>,
    transportadora_ids: Vec<String>,
    descricao: Option<String>,
    nota: Option<String>,
    valor_produto: Option<String>,
    peso: Option<String>,
    cep_destino: Option<String>,
    endereco_destino: Option<String>,
    data_criacao: Option<String>,
) -> Result<String, String> {

    if transportadora_ids.is_empty() {
        return Err("Selecione ao menos uma transportadora.".to_string());
    }

    let database = db::get_database().await?;

    let (descricao, nota, valor_produto, peso, cep_destino, endereco_destino, data_criacao) = if let Some(orcamento_id) = orcamento_id.clone() {
        let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
            .map_err(|e| format!("ID de orçamento inválido: {}", e))?;
        let orcamento = database
            .orcamentos
            .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
            .await
            .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
            .ok_or_else(|| "Orçamento não encontrado".to_string())?;

        (
            Some(orcamento.descricao),
            orcamento.nota,
            orcamento.valor_produto.map(|v| v.to_string()),
            orcamento.peso.map(|v| v.to_string()),
            orcamento.cep_destino,
            orcamento.endereco_destino,
            Some(orcamento.data_criacao),
        )
    } else {
        (
            descricao,
            nota,
            valor_produto,
            peso,
            cep_destino,
            endereco_destino,
            data_criacao,
        )
    };

    let descricao = descricao.unwrap_or_default();
    let nota = nota.unwrap_or_default();
    let valor_produto = valor_produto.unwrap_or_default();
    let peso = peso.unwrap_or_default();
    let cep_destino = cep_destino.unwrap_or_default();
    let endereco_destino = endereco_destino.unwrap_or_default();
    let data_criacao = data_criacao.unwrap_or_default();

    let mut object_ids = Vec::new();
    for transportadora_id in &transportadora_ids {
        let oid = mongodb::bson::oid::ObjectId::parse_str(&transportadora_id)
            .map_err(|e| format!("ID de transportadora inválido: {}", e))?;
        object_ids.push(oid);
    }

    let filter = mongodb::bson::doc! { "_id": { "$in": object_ids } };
    let mut cursor = database
        .transportadoras
        .find(filter)
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadoras = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar transportadoras: {}", e))?
    {
        let t: db::models::Transportadora = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar transportadora: {}", e))?;
        transportadoras.push(t);
    }

    if transportadoras.is_empty() {
        return Err("Nenhuma transportadora encontrada".to_string());
    }

    let gmail = gmail_client::GmailClient::authenticate().await?;
    let mut errors: Vec<String> = Vec::new();

    for transportadora in transportadoras {
        let to = transportadora.email_orcamento.trim();
        if to.is_empty() {
            errors.push(format!("{} não tem email de orçamento", transportadora.nome));
            continue;
        }

        let subject = format!("Solicitação de orçamento - nota {}", nota.trim());
        let body = format!(
            "<p>Olá {},</p>\n\n\
            <p>Solicito orçamento para os seguintes dados:</p>\n\n\
            <table cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;\">\n\
              <tr><td><strong>Descrição:</strong></td><td>{}</td></tr>\n\
              <tr><td><strong>Nota:</strong></td><td>{}</td></tr>\n\
              <tr><td><strong>Valor do produto:</strong></td><td>{}</td></tr>\n\
              <tr><td><strong>Peso:</strong></td><td>{}</td></tr>\n\
              <tr><td><strong>CEP destino:</strong></td><td>{}</td></tr>\n\
              <tr><td><strong>Endereço destino:</strong></td><td>{}</td></tr>\n\
              <tr><td><strong>Data de criação:</strong></td><td>{}</td></tr>\n\
            </table>\n\n\
            <p>Por favor, envie sua proposta com prazo e valor o mais breve possível.</p>\n\n\
            <p>Obrigado.</p>",
            transportadora.nome,
            descricao.trim(),
            nota.trim(),
            valor_produto.trim(),
            peso.trim(),
            cep_destino.trim(),
            endereco_destino.trim(),
            data_criacao.trim(),
        );

        if let Err(err) = gmail.send_email(to, &subject, &body).await {
            errors.push(format!("{}: {}", transportadora.nome, err));
        }
    }

    if let Some(orcamento_id) = orcamento_id {
        let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
            .map_err(|e| format!("ID de orçamento inválido: {}", e))?;
        let ids_bson: Vec<mongodb::bson::Bson> = transportadora_ids
            .iter()
            .map(|id| mongodb::bson::Bson::String(id.clone()))
            .collect();

        let update_doc = mongodb::bson::doc! {
            "$addToSet": {
                "transportadoras_enviadas": { "$each": ids_bson }
            }
        };

        database
            .orcamentos
            .update_one(
                mongodb::bson::doc! { "_id": orcamento_oid },
                update_doc,
            )
            .await
            .map_err(|e| format!("Erro ao atualizar orcamento com transportadoras enviadas: {}", e))?;
    }

    if errors.is_empty() {
        Ok(format!("E-mails enviados para {} transportadora(s)", transportadora_ids.len()))
    } else {
        Err(format!("Erro ao enviar e-mails: {}", errors.join("; ")))
    }
}


#[tauri::command]
async fn filter_orcamentos_by(filter: String, value: String) -> Result<Vec<OrcamentoRecenteItem>, String> {
    let database = db::get_database().await?;
    let mut transportadoras_cursor = database
        .transportadoras
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadora_nome_por_id: HashMap<mongodb::bson::oid::ObjectId, String> = HashMap::new();

    while transportadoras_cursor
        .advance()
        .await
        .map_err(|e| format!("Erro ao coletar transportadoras: {}", e))?
    {
        let transportadora: db::models::Transportadora = transportadoras_cursor
            .deserialize_current()
            .map_err(|e| format!("Erro ao desserializar transportadora: {}", e))?;

        if let Some(id) = transportadora.id {
            transportadora_nome_por_id.insert(id, transportadora.nome);
        }
    }

    let is_data_iso = |data: &str| -> bool {
        let partes: Vec<&str> = data.split('-').collect();
        if partes.len() != 3 {
            return false;
        }

        if partes[0].len() != 4 || partes[1].len() != 2 || partes[2].len() != 2 {
            return false;
        }

        let ano_ok = partes[0].parse::<u32>().is_ok();
        let mes = match partes[1].parse::<u32>() {
            Ok(valor) => valor,
            Err(_) => return false,
        };
        let dia = match partes[2].parse::<u32>() {
            Ok(valor) => valor,
            Err(_) => return false,
        };

        ano_ok && (1..=12).contains(&mes) && (1..=31).contains(&dia)
    };

    match filter.as_str(){
         "nota" => {
            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "nota": &value })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();

            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
         },

         "descricao" => {
            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "descricao": &value })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();

            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
         }, 

         // por CEP de destino (igual)
         "cep_destino" => {
             let cep = value.trim();
             if cep.is_empty() {
                 return Err("CEP de destino não pode estar vazio".to_string());
             }

             let mut cursor = database
                 .orcamentos
                 .find(mongodb::bson::doc! { "cep_destino": cep })
                 .await
                 .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

             let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();

             while cursor
                 .advance()
                 .await
                 .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
             {
                 let orcamento = cursor
                     .deserialize_current()
                     .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                 let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                 let status = status_orcamento(&orcamento);
                 itens.push(OrcamentoRecenteItem {
                     id,
                     pedido: orcamento.descricao.clone(),
                     status,
                     propostas: orcamento.propostas.len() as u32,
                     data: orcamento.data_criacao.clone(),
                     transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                 });
             }

             Ok(itens)
         },

         // por valor de frete (compatível legado), value deve ser JSON no formato [min,max]
         "valor" => {
            let valores: Vec<f64> = serde_json::from_str(&value)
                .map_err(|_| "Valor para filtro de valor deve ser JSON no formato [min,max]".to_string())?;

            if valores.len() != 2 {
                return Err("Valor para filtro de valor deve conter exatamente 2 números".to_string());
            }

            let min = valores[0];
            let max = valores[1];

            if min > max {
                return Err("Valor mínimo deve ser menor ou igual ao valor máximo".to_string());
            }

            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "valor": { "$gte": min, "$lte": max } })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();
            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
         },

         // por valor do produto
         "valor_produto" => {
            let valores: Vec<f64> = serde_json::from_str(&value)
                .map_err(|_| "Valor para filtro de valor_produto deve ser JSON no formato [min,max]".to_string())?;

            if valores.len() != 2 {
                return Err("Valor para filtro de valor_produto deve conter exatamente 2 números".to_string());
            }

            let min = valores[0];
            let max = valores[1];

            if min > max {
                return Err("Valor mínimo deve ser menor ou igual ao valor máximo".to_string());
            }

            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "valor_produto": { "$gte": min, "$lte": max } })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();
            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
         },

        // por peso do produto
        "peso" => {
            let valores: Vec<f64> = serde_json::from_str(&value)
                .map_err(|_| "Valor para filtro de peso deve ser JSON no formato [min,max]".to_string())?;

            if valores.len() != 2 {
                return Err("Valor para filtro de peso deve conter exatamente 2 números".to_string());
            }

            let min = valores[0];
            let max = valores[1];

            if min > max {
                return Err("Peso mínimo deve ser menor ou igual ao peso máximo".to_string());
            }

            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "peso": { "$gte": min, "$lte": max } })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();
            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
         },
        // por data_criacao, value deve ser JSON no formato ["YYYY-MM-DD","YYYY-MM-DD"]
        "data_criacao" => {
            let datas: Vec<String> = serde_json::from_str(&value)
                .map_err(|_| "Valor para filtro de data_criacao deve ser JSON no formato [\"YYYY-MM-DD\",\"YYYY-MM-DD\"]".to_string())?;

            if datas.len() != 2 {
                return Err("Valor para filtro de data_criacao deve conter exatamente 2 datas".to_string());
            }

            let min = datas[0].as_str();
            let max = datas[1].as_str();

            if !is_data_iso(min) || !is_data_iso(max) {
                return Err("As datas devem estar no formato YYYY-MM-DD".to_string());
            }

            if min > max {
                return Err("Data mínima deve ser menor ou igual à data máxima".to_string());
            }

            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "data_criacao": { "$gte": min, "$lte": max } })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();

            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
        },
        // por transportadora, value deve ser JSON no formato ["id1","id2",...]
        "transportadora" => {
            let transportadora_ids: Vec<String> = serde_json::from_str(&value)
                .map_err(|_| "Valor para filtro de transportadora deve ser JSON no formato [\"id1\",\"id2\",...]".to_string())?;

            if transportadora_ids.is_empty() {
                return Err("Informe ao menos um ID de transportadora".to_string());
            }

            let mut object_ids = Vec::new();
            for id_str in transportadora_ids {
                let oid = mongodb::bson::oid::ObjectId::parse_str(&id_str)
                    .map_err(|_| format!("ID de transportadora inválido: {}", id_str))?;
                object_ids.push(oid);
            }
            let mut cursor = database
                .orcamentos
                .find(mongodb::bson::doc! { "propostas.transportadora_id": { "$in": object_ids } })
                .await
                .map_err(|e| format!("Erro ao buscar orçamentos: {}", e))?;

            let mut itens: Vec<OrcamentoRecenteItem> = Vec::new();

            while cursor
                .advance()
                .await
                .map_err(|e| format!("Erro ao coletar orçamentos: {}", e))?
            {
                let orcamento = cursor
                    .deserialize_current()
                    .map_err(|e| format!("Erro ao desserializar orçamento: {}", e))?;
                let id = orcamento.id.as_ref().map(|oid| oid.to_hex()).unwrap_or_default();
                let status = status_orcamento(&orcamento);
                itens.push(OrcamentoRecenteItem {
                    id,
                    pedido: orcamento.descricao.clone(),
                    status,
                    propostas: orcamento.propostas.len() as u32,
                    data: orcamento.data_criacao.clone(),
                    transportadoras_preview: transportadoras_preview_for_orcamento(&orcamento, &transportadora_nome_por_id),
                });
            }

            Ok(itens)
        },

        _ => Err("Filtro inválido. Use: descricao, cep_destino, valor_produto, peso, data_criacao ou transportadora".to_string()),
    }
}

// ── Google Auth commands ───────────────────────────────────────

#[tauri::command]
async fn google_auth_get_status() -> Result<google_auth::AuthStatus, String> {
    let auth = google_auth::get_global_auth_state();
    let guard = auth.lock().await;
    Ok(guard.status())
}

#[tauri::command]
async fn google_auth_start_login() -> Result<String, String> {
    // 1. Gerar URL de autorização
    let auth_url = google_auth::build_auth_url()?;

    // 2. Abrir no navegador padrão
    open::that(&auth_url)
        .map_err(|e| format!("Erro ao abrir navegador: {}", e))?;

    // 3. Aguardar callback com o code
    let code = google_auth::wait_for_auth_code().await?;

    // 4. Trocar code por tokens
    let stored_token = google_auth::exchange_code_for_tokens(&code).await?;

    let email = stored_token.email.clone().unwrap_or_else(|| "desconhecido".to_string());

    // 5. Salvar no estado global
    {
        let auth = google_auth::get_global_auth_state();
        let mut guard = auth.lock().await;
        guard.set_token(stored_token);
    }

    Ok(format!("Login realizado com sucesso: {}", email))
}

#[tauri::command]
async fn google_auth_logout() -> Result<String, String> {
    let auth = google_auth::get_global_auth_state();
    let mut guard = auth.lock().await;
    guard.clear();
    Ok("Logout realizado. Token removido.".to_string())
}

// ── Watcher commands ──────────────────────────────────────────

#[tauri::command]
async fn start_email_watcher(
    app: tauri::AppHandle,
    watcher: State<'_, Arc<email_watcher::EmailWatcher>>,
) -> Result<String, String> {
    if watcher.is_running() {
        return Ok("Watcher já está rodando".to_string());
    }
    watcher.start(app);
    Ok("Watcher iniciado".to_string())
}

#[tauri::command]
async fn stop_email_watcher(
    watcher: State<'_, Arc<email_watcher::EmailWatcher>>,
) -> Result<String, String> {
    watcher.stop();
    Ok("Watcher parado".to_string())
}

#[tauri::command]
async fn get_watcher_status(
    watcher: State<'_, Arc<email_watcher::EmailWatcher>>,
) -> Result<email_watcher::WatcherStatus, String> {
    Ok(watcher.get_status().await)
}

#[derive(Debug, Serialize)]
struct EmailPendenteItem {
    id: String,
    gmail_message_id: String,
    tipo: String,
    transportadora_nome: String,
    assunto: Option<String>,
    remetente: Option<String>,
    valor_extraido: Option<i32>,
    processado_em: String,
    status: String,
}

#[tauri::command]
async fn get_emails_pendentes() -> Result<Vec<EmailPendenteItem>, String> {
    let database = db::get_database().await?;

    let options = mongodb::options::FindOptions::builder()
        .sort(mongodb::bson::doc! { "processado_em": -1 })
        .limit(50)
        .build();

    let mut cursor = database
        .emails_processados
        .find(mongodb::bson::doc! {})
        .with_options(options)
        .await
        .map_err(|e| format!("Erro ao buscar emails processados: {}", e))?;

    let mut items: Vec<EmailPendenteItem> = Vec::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro cursor: {}", e))?
    {
        let email = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro deserializar: {}", e))?;

        items.push(EmailPendenteItem {
            id: email.id.map(|oid| oid.to_hex()).unwrap_or_default(),
            gmail_message_id: email.gmail_message_id,
            tipo: email.tipo,
            transportadora_nome: email.transportadora_nome,
            assunto: email.assunto,
            remetente: email.remetente,
            valor_extraido: email.valor_extraido,
            processado_em: email.processado_em,
            status: email.status,
        });
    }

    Ok(items)
}

#[tauri::command]
async fn associar_email_a_orcamento(
    email_id: String,
    orcamento_id: String,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let email_oid = mongodb::bson::oid::ObjectId::parse_str(&email_id)
        .map_err(|e| format!("ID de email inválido: {}", e))?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    // Buscar o email
    let email = database
        .emails_processados
        .find_one(mongodb::bson::doc! { "_id": email_oid })
        .await
        .map_err(|e| format!("Erro ao buscar email: {}", e))?
        .ok_or("Email não encontrado")?;

    // Buscar o orçamento
    let orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or("Orçamento não encontrado")?;

    // Se temos valor, criar proposta
    if let Some(valor) = email.valor_extraido {
        let mut orc = orcamento.clone();
        let hoje = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let prazo_entrega = email
            .prazo_extraido
            .as_deref()
            .and_then(|value| {
                value
                    .trim()
                    .split(|c: char| !c.is_ascii_digit())
                    .find(|part| !part.is_empty())
                    .and_then(|digits| digits.parse::<i32>().ok())
            });

        let proposta = db::models::Proposta {
            id: Some(mongodb::bson::oid::ObjectId::new().to_hex()),
            valor_proposta: valor as f64 / 100.0,
            valor_frete_pago: None,
            prazo_entrega,
            transportadora_id: Some(email.transportadora_id),
            data_proposta: hoje,
            origem: "email".to_string(),
        };
        orc.propostas.push(proposta);

        database
            .orcamentos
            .replace_one(mongodb::bson::doc! { "_id": orcamento_oid }, &orc)
            .await
            .map_err(|e| format!("Erro ao adicionar proposta: {}", e))?;
    }

    // Atualizar status do email
    database
        .emails_processados
        .update_one(
            mongodb::bson::doc! { "_id": email_oid },
            mongodb::bson::doc! {
                "$set": {
                    "status": "aplicado",
                    "orcamento_id": orcamento_oid,
                    "orcamento_descricao": orcamento.descricao
                }
            },
        )
        .await
        .map_err(|e| format!("Erro ao atualizar email: {}", e))?;

    Ok("Email associado ao orçamento com sucesso".to_string())
}

#[tauri::command]
async fn descartar_email(email_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let email_oid = mongodb::bson::oid::ObjectId::parse_str(&email_id)
        .map_err(|e| format!("ID de email inválido: {}", e))?;

    let update_result = database
        .emails_processados
        .update_one(
            mongodb::bson::doc! { "_id": email_oid },
            mongodb::bson::doc! { "$set": { "status": "descartado" } },
        )
        .await
        .map_err(|e| format!("Erro ao descartar email: {}", e))?;

    if update_result.matched_count == 0 {
        return Err("Email não encontrado".to_string());
    }

    Ok("Email descartado".to_string())
}

#[tauri::command]
async fn excluir_orcamento(orcamento_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let delete_result = database
        .orcamentos
        .delete_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao excluir orçamento: {}", e))?;

    if delete_result.deleted_count == 0 {
        return Err("Orçamento não encontrado".to_string());
    }

    Ok("Orçamento excluído com sucesso".to_string())
}

#[tauri::command]
async fn excluir_email(email_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let email_oid = mongodb::bson::oid::ObjectId::parse_str(&email_id)
        .map_err(|e| format!("ID de email inválido: {}", e))?;

    let delete_result = database
        .emails_processados
        .delete_one(mongodb::bson::doc! { "_id": email_oid })
        .await
        .map_err(|e| format!("Erro ao excluir email: {}", e))?;

    if delete_result.deleted_count == 0 {
        return Err("Email não encontrado".to_string());
    }

    Ok("Email excluído".to_string())
}

/// Busca o XML CT-e do email de nota associado a um orçamento e retorna em base64.
#[tauri::command]
async fn buscar_xml_orcamento(orcamento_id: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    // Buscar email de nota aplicado a este orçamento
    let email = database
        .emails_processados
        .find_one(mongodb::bson::doc! {
            "orcamento_id": orcamento_oid,
            "tipo": "nota",
        })
        .await
        .map_err(|e| format!("Erro ao buscar email: {}", e))?
        .ok_or_else(|| "Nenhum email de nota encontrado para este orçamento".to_string())?;

    let gmail = gmail_client::GmailClient::authenticate().await?;
    let msg = gmail
        .get_message(&email.gmail_message_id)
        .await
        .map_err(|e| format!("Erro ao buscar mensagem Gmail: {}", e))?;

    let xml_attachments = msg
        .payload
        .as_ref()
        .map(gmail_client::collect_xml_attachment_ids)
        .unwrap_or_default();

    if xml_attachments.is_empty() {
        return Err("Nenhum anexo XML encontrado no email de nota".to_string());
    }

    let (att_id, _filename) = &xml_attachments[0];
    let xml_bytes = gmail
        .get_attachment(&email.gmail_message_id, att_id)
        .await
        .map_err(|e| format!("Erro ao baixar XML: {}", e))?;

    Ok(STANDARD.encode(&xml_bytes))
}
/// Extracts NF number from a 44-digit chave (positions 25-34, 0-indexed)
fn extrair_numero_nf_da_chave(chave: &str) -> String {
    let digits: String = chave.chars().filter(|c| c.is_ascii_digit()).collect();
    // NF-e access key structure: cUF(2)+AAMM(4)+CNPJ(14)+mod(2)+serie(3)+nNF(9)+tpEmis(1)+cNF(8)+cDV(1)
    if digits.len() >= 43 {
        let n = &digits[25..34]; // nNF is exactly 9 digits at positions [25:34]
        n.trim_start_matches('0').to_string()
    } else {
        String::new()
    }
}

/// Compares two NF numbers ignoring leading zeros (treats them as integers).
/// Returns true if they represent the same number.
fn nf_numeros_iguais(a: &str, b: &str) -> bool {
    let digits_a: String = a.chars().filter(|c| c.is_ascii_digit()).collect();
    let digits_b: String = b.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits_a.is_empty() || digits_b.is_empty() {
        return false;
    }
    // Parse as u64 to ignore all leading zeros
    match (digits_a.parse::<u64>(), digits_b.parse::<u64>()) {
        (Ok(na), Ok(nb)) => na == nb,
        _ => digits_a.trim_start_matches('0') == digits_b.trim_start_matches('0'),
    }
}

fn calcular_volume_orcamento_m3(orcamento: &db::models::Orcamento) -> f64 {
    if let Some(volumes) = &orcamento.volumes {
        volumes.iter()
            .map(|v| v.comprimento * v.largura * v.altura)
            .sum()
    } else if let Some(dimensoes) = &orcamento.dimensoes {
        dimensoes.comprimento * dimensoes.largura * dimensoes.altura
    } else {
        0.0
    }
}

fn normalize_text(value: &str) -> String {
    value.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Compares a CT-e XML against an orcamento, returning field-by-field comparison.
#[tauri::command]
async fn comparar_cte_xml(orcamento_id: String, xml_base64: String) -> Result<serde_json::Value, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let xml_bytes = STANDARD.decode(&xml_base64)
        .map_err(|e| format!("Erro ao decodificar XML base64: {}", e))?;
    let xml_text = String::from_utf8_lossy(&xml_bytes).to_string();

    let mut cte = cte_parser::parse_cte_xml(&xml_bytes)?;

    let mut missing_fields: Vec<&str> = Vec::new();
    if cte.cidade_destino.trim().is_empty() { missing_fields.push("cidade_destino"); }
    if cte.uf_destino.trim().is_empty() { missing_fields.push("uf_destino"); }
    if cte.xlgr_destino.trim().is_empty() { missing_fields.push("xlgr_destino"); }
    if cte.nro_destino.trim().is_empty() { missing_fields.push("nro_destino"); }
    if cte.cep_destino.trim().is_empty() { missing_fields.push("cep_destino"); }
    if cte.cnpj_remetente.trim().is_empty() { missing_fields.push("cnpj_remetente"); }
    if cte.chave_nfe.trim().is_empty() { missing_fields.push("chave_nfe"); }
    if cte.valor_carga <= 0.0 { missing_fields.push("valor_carga"); }
    if cte.peso_real <= 0.0 { missing_fields.push("peso_real"); }
    if cte.volume_m3 <= 0.0 { missing_fields.push("volume_m3"); }
    if cte.qtd_volumes == 0 { missing_fields.push("qtd_volumes"); }

    if !missing_fields.is_empty() {
        println!("[comparar_cte_xml] Campos faltantes no XML: {:?}", missing_fields);
        if let Ok(inferidos) = gemini_client::inferir_campos_cte(&xml_text, &missing_fields).await {
            if let Some(value) = inferidos.get("cidade_destino").filter(|v| !v.trim().is_empty()) {
                cte.cidade_destino = value.clone();
            }
            if let Some(value) = inferidos.get("uf_destino").filter(|v| !v.trim().is_empty()) {
                cte.uf_destino = value.clone();
            }
            if let Some(value) = inferidos.get("xlgr_destino").filter(|v| !v.trim().is_empty()) {
                cte.xlgr_destino = value.clone();
            }
            if let Some(value) = inferidos.get("nro_destino").filter(|v| !v.trim().is_empty()) {
                cte.nro_destino = value.clone();
            }
            if let Some(value) = inferidos.get("cep_destino").filter(|v| !v.trim().is_empty()) {
                cte.cep_destino = value.clone();
            }
            if let Some(value) = inferidos.get("cnpj_remetente").filter(|v| !v.trim().is_empty()) {
                cte.cnpj_remetente = value.clone();
            }
            if let Some(value) = inferidos.get("chave_nfe").filter(|v| !v.trim().is_empty()) {
                cte.chave_nfe = value.clone();
            }
            if let Some(value) = inferidos.get("valor_carga").filter(|v| !v.trim().is_empty()) {
                if let Ok(parsed) = value.trim().replace(',', ".").parse::<f64>() {
                    cte.valor_carga = parsed;
                }
            }
            if let Some(value) = inferidos.get("peso_real").filter(|v| !v.trim().is_empty()) {
                if let Ok(parsed) = value.trim().replace(',', ".").parse::<f64>() {
                    cte.peso_real = parsed;
                }
            }
            if let Some(value) = inferidos.get("volume_m3").filter(|v| !v.trim().is_empty()) {
                if let Ok(parsed) = value.trim().replace(',', ".").parse::<f64>() {
                    cte.volume_m3 = parsed;
                }
            }
            if let Some(value) = inferidos.get("qtd_volumes").filter(|v| !v.trim().is_empty()) {
                if let Ok(parsed) = value.trim().parse::<u32>() {
                    cte.qtd_volumes = parsed;
                }
            }
        } else {
            println!("[comparar_cte_xml] Falha no fallback de IA para campos faltantes");
        }
    }

    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    // Campos já aceitos pelo usuário como não-divergência — serão ignorados na análise
    let campos_aceitos_set: std::collections::HashSet<String> =
        orcamento.divergencia_campos_aceitos.iter().cloned().collect();

    let proposta_ganhadora = orcamento.proposta_ganhadora_id.as_deref()
        .and_then(|gid| orcamento.propostas.iter().find(|p| p.id.as_deref() == Some(gid)));

    let mut campos: Vec<serde_json::Value> = Vec::new();
    let mut tem_divergencia = false;

    // CNPJ do Remetente
    let cnpj_orc = orcamento.cnpj_pagador.as_deref().unwrap_or("").replace(['.', '/', '-'], "");
    let cnpj_xml = cte.cnpj_remetente.replace(['.', '/', '-'], "");
    let div = !cnpj_orc.is_empty() && !cnpj_xml.is_empty() && cnpj_orc != cnpj_xml;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "CNPJ do Remetente",
        "valor_orcamento": orcamento.cnpj_pagador.as_deref().unwrap_or("-"),
        "valor_xml": &cte.cnpj_remetente,
        "divergente": div
    }));

    // CEP destino
    let cep_orc = orcamento.cep_destino.as_deref().unwrap_or("").replace('-', "");
    let cep_xml = cte.cep_destino.replace('-', "");
    let div = !cep_orc.is_empty() && !cep_xml.is_empty() && cep_orc != cep_xml;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "CEP Destino",
        "valor_orcamento": orcamento.cep_destino.as_deref().unwrap_or("-"),
        "valor_xml": &cte.cep_destino,
        "divergente": div
    }));

    // Cidade destino
    let cidade_orc = normalize_text(orcamento.cidade_destino.as_deref().unwrap_or(orcamento.endereco_destino.as_deref().unwrap_or("")));
    let cidade_xml_normalized = normalize_text(&cte.cidade_destino);
    let div = !cidade_xml_normalized.is_empty() && !cidade_orc.is_empty()
        && !cidade_orc.contains(&cidade_xml_normalized);
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Cidade Destino",
        "valor_orcamento": orcamento.cidade_destino.as_deref().unwrap_or(orcamento.endereco_destino.as_deref().unwrap_or("-")),
        "valor_xml": &cte.cidade_destino,
        "divergente": div
    }));

    // UF destino
    let uf_orc = orcamento.uf_destino.as_deref().unwrap_or("").trim().to_uppercase();
    let uf_xml = cte.uf_destino.trim().to_uppercase();
    let div = !uf_orc.is_empty() && !uf_xml.is_empty() && uf_orc != uf_xml;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "UF Destino",
        "valor_orcamento": orcamento.uf_destino.as_deref().unwrap_or("-"),
        "valor_xml": &cte.uf_destino,
        "divergente": div
    }));

    // Bairro destino
    campos.push(serde_json::json!({
        "campo": "Bairro Destino",
        "valor_orcamento": orcamento.bairro_destino.as_deref().unwrap_or("-"),
        "valor_xml": "-",
        "divergente": false
    }));

    // Rua destino
    let rua_orc = orcamento.logradouro_destino.as_deref().unwrap_or("").trim().to_lowercase();
    let rua_xml = cte.xlgr_destino.trim().to_lowercase();
    let div = !rua_orc.is_empty() && !rua_xml.is_empty() && rua_orc != rua_xml;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Rua Destino",
        "valor_orcamento": orcamento.logradouro_destino.as_deref().unwrap_or("-"),
        "valor_xml": &cte.xlgr_destino,
        "divergente": div
    }));

    // Número destino
    let numero_orc = orcamento.numero_destino.as_deref().unwrap_or("").trim().to_lowercase();
    let numero_xml = cte.nro_destino.trim().to_lowercase();
    let div = !numero_orc.is_empty() && !numero_xml.is_empty() && numero_orc != numero_xml;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Número Destino",
        "valor_orcamento": orcamento.numero_destino.as_deref().unwrap_or("-"),
        "valor_xml": &cte.nro_destino,
        "divergente": div
    }));

    // Peso
    let peso_orc = orcamento.peso;
    let peso_orc_val = peso_orc.unwrap_or(0.0);
    let mut div = false;
    if peso_orc.is_some() && cte.peso_real > 0.0 {
        let peso_match = orcamento
            .peso
            .map(|v| (v - cte.peso_real).abs() < 1e-6)
            .unwrap_or(false);
        div = !peso_match;
    }
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Peso (kg)",
        "valor_orcamento": if peso_orc_val > 0.0 { format!("{:.3}", peso_orc_val) } else { "-".to_string() },
        "valor_xml": if cte.peso_real > 0.0 { format!("{:.3}", cte.peso_real) } else { "-".to_string() },
        "divergente": div
    }));

    // Volume m³
    let volume_orc = calcular_volume_orcamento_m3(&orcamento);
    let div = volume_orc > 0.0 && cte.volume_m3 > 0.0 && (volume_orc - cte.volume_m3).abs() > 0.01;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Volume m³",
        "valor_orcamento": if volume_orc > 0.0 { format!("{:.4}", volume_orc) } else { "-".to_string() },
        "valor_xml": if cte.volume_m3 > 0.0 { format!("{:.4}", cte.volume_m3) } else { "-".to_string() },
        "divergente": div
    }));

    // Qtd Volumes
    let qtd_orc = orcamento.qtd_volumes.unwrap_or(0);
    let div = qtd_orc > 0 && cte.qtd_volumes > 0 && qtd_orc != cte.qtd_volumes;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Qtd. Volumes",
        "valor_orcamento": if qtd_orc > 0 { qtd_orc.to_string() } else { "-".to_string() },
        "valor_xml": if cte.qtd_volumes > 0 { cte.qtd_volumes.to_string() } else { "-".to_string() },
        "divergente": div
    }));

    // Número de Nota vs chave NF-e
    let nota_orc = orcamento.nota.as_deref()
        .unwrap_or("").trim().to_string();
    let nf_numero_xml = extrair_numero_nf_da_chave(&cte.chave_nfe);
    let div = !nota_orc.is_empty() && !nf_numero_xml.is_empty()
        && !nf_numeros_iguais(&nota_orc, &nf_numero_xml);
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Número de Nota",
        "valor_orcamento": if nota_orc.is_empty() { "-".to_string() } else { nota_orc },
        "valor_xml": if nf_numero_xml.is_empty() { cte.chave_nfe.clone() } else { nf_numero_xml },
        "divergente": div
    }));

    // Valor orçado (proposta ganhadora) vs valor frete XML
    if let Some(ganhadora) = proposta_ganhadora {
        let valor_orc = ganhadora.valor_proposta;
        let valor_xml = cte.valor_frete_original;
        let div = (valor_orc - valor_xml).abs() > 0.01;
        if div { tem_divergencia = true; }
        campos.push(serde_json::json!({
            "campo": "Valor Orçado vs Frete XML",
            "valor_orcamento": format!("R$ {:.2}", valor_orc),
            "valor_xml": format!("R$ {:.2}", valor_xml),
            "divergente": div
        }));
    }

    // Valor da nota (valor_produto) vs valor carga XML
    let valor_nota_orc = orcamento.valor_produto.unwrap_or(0.0);
    let div = valor_nota_orc > 0.0 && cte.valor_carga > 0.0
        && (valor_nota_orc - cte.valor_carga).abs() > 0.01;
    if div { tem_divergencia = true; }
    campos.push(serde_json::json!({
        "campo": "Valor da Nota (mercadoria)",
        "valor_orcamento": if valor_nota_orc > 0.0 { format!("R$ {:.2}", valor_nota_orc) } else { "-".to_string() },
        "valor_xml": if cte.valor_carga > 0.0 { format!("R$ {:.2}", cte.valor_carga) } else { "-".to_string() },
        "divergente": div
    }));

    // Ignorar campos que o usuário já aceitou como não-divergência
    if !campos_aceitos_set.is_empty() {
        for campo in campos.iter_mut() {
            if let Some(nome) = campo.get("campo").and_then(|v| v.as_str()) {
                if campos_aceitos_set.contains(nome) {
                    campo["divergente"] = serde_json::json!(false);
                }
            }
        }
        // Recalcular flag global após filtrar aceitos
        tem_divergencia = campos
            .iter()
            .any(|c| c.get("divergente").and_then(|v| v.as_bool()).unwrap_or(false));
    }

    // Persistir divergencia_campos no banco com todos os campos divergentes encontrados
    let campos_divergentes_nomes: Vec<String> = campos
        .iter()
        .filter(|c| c.get("divergente").and_then(|v| v.as_bool()).unwrap_or(false))
        .map(|c| {
            let campo = c.get("campo").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let orc = c.get("valor_orcamento").and_then(|v| v.as_str()).unwrap_or("-");
            let xml = c.get("valor_xml").and_then(|v| v.as_str()).unwrap_or("-");
            format!("{}: orçamento={}, XML={}", campo, orc, xml)
        })
        .collect();

    // Sempre atualizar divergencia_campos (limpa entradas desatualizadas de análises anteriores)
    let campos_bson: Vec<mongodb::bson::Bson> = campos_divergentes_nomes
        .iter()
        .map(|c| mongodb::bson::Bson::String(c.clone()))
        .collect();
    let mut set_doc = mongodb::bson::doc! {
        "divergencia_campos": campos_bson,
    };
    if !campos_divergentes_nomes.is_empty() {
        set_doc.insert("divergencia_tratada", false);
        set_doc.insert("divergencia_email_status", "pendente");
    }
    let _ = database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! { "$set": set_doc },
        )
        .await;

    Ok(serde_json::json!({
        "orcamento_id": orcamento_id,
        "campos": campos,
        "tem_divergencia": tem_divergencia
    }))
}

/// Sends a divergence notification email to the winning transportadora.
#[tauri::command]
async fn enviar_email_divergencia(
    orcamento_id: String,
    campos_divergentes: Vec<String>,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_oid })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or_else(|| "Orçamento não encontrado".to_string())?;

    let proposta_ganhadora = orcamento.proposta_ganhadora_id.as_deref()
        .and_then(|gid| orcamento.propostas.iter().find(|p| p.id.as_deref() == Some(gid)));

    let transportadora_oid = proposta_ganhadora
        .and_then(|p| p.transportadora_id)
        .ok_or_else(|| "Proposta ganhadora ou transportadora não encontrada".to_string())?;

    let transportadora = database
        .transportadoras
        .find_one(mongodb::bson::doc! { "_id": transportadora_oid })
        .await
        .map_err(|e| format!("Erro ao buscar transportadora: {}", e))?
        .ok_or_else(|| "Transportadora não encontrada".to_string())?;

    let email_to = transportadora.email_nota.trim();
    if email_to.is_empty() {
        return Err("Transportadora não possui email de nota cadastrado".to_string());
    }

    let nota = orcamento.nota.as_deref().unwrap_or("");
    let numero_cotacao = orcamento.numero_cotacao.as_deref().unwrap_or("");
    let campos_str = campos_divergentes.iter()
        .map(|c| format!("<li>{}</li>", c))
        .collect::<Vec<_>>()
        .join("\n");

    let subject = format!("Divergência detectada - NF:{} COT:{}", nota, numero_cotacao);
    let body = format!(
        "<p>Prezada {},</p>\n\n\
        <p>Identificamos divergências no frete referente ao orçamento <strong>{}</strong>.</p>\n\n\
        <p><strong>Campos com divergência:</strong></p>\n\
        <ul>\n{}\n</ul>\n\
        <p>Solicito correção ou esclarecimento dos campos acima.</p>\n\
        <p>Por favor, responda este e-mail com as devidas correções.</p>\n\n\
        <p>Atenciosamente,<br/>Equipe Ultimax - Monitor de Fretes v1.0.1</p>",
        transportadora.nome, orcamento.descricao, campos_str
    );

    let gmail = gmail_client::GmailClient::authenticate().await?;
    gmail.send_email(email_to, &subject, &body).await?;

    let now_iso = chrono::Utc::now().to_rfc3339();
    let campos_bson: Vec<mongodb::bson::Bson> = campos_divergentes.iter()
        .map(|c| mongodb::bson::Bson::String(c.clone()))
        .collect();

    database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! {
                "$set": {
                    "divergencia_email_status": "email_enviado",
                    "divergencia_campos": campos_bson,
                    "divergencia_email_enviado_em": &now_iso,
                    "divergencia_tratada": false,
                }
            },
        )
        .await
        .map_err(|e| format!("Erro ao atualizar orçamento: {}", e))?;

    Ok(format!("Email de divergência enviado para {}", email_to))
}

/// Marks a divergence as finalized (divergencia_tratada = true).
#[tauri::command]
async fn finalizar_divergencia(orcamento_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let result = database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! {
                "$set": {
                    "divergencia_tratada": true,
                    "divergencia_email_status": "finalizada",
                }
            },
        )
        .await
        .map_err(|e| format!("Erro ao finalizar divergência: {}", e))?;

    if result.matched_count == 0 {
        return Err("Orçamento não encontrado".to_string());
    }
    Ok("Divergência finalizada".to_string())
}

/// Persists the remaining divergent fields (after user-accepted ones are removed)
/// and adjusts status: if nothing pending, marks as todos_verificados.
#[tauri::command]
async fn salvar_campos_divergencia(
    orcamento_id: String,
    campos_pendentes: Vec<String>,
    campos_aceitos: Vec<String>,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let campos_bson: Vec<mongodb::bson::Bson> = campos_pendentes
        .iter()
        .map(|c| mongodb::bson::Bson::String(c.clone()))
        .collect();

    let campos_aceitos_bson: Vec<mongodb::bson::Bson> = campos_aceitos
        .iter()
        .map(|c| mongodb::bson::Bson::String(c.clone()))
        .collect();

    // If all fields have been verified, mark as resolved automatically
    let (status, tratada): (&str, bool) = if campos_pendentes.is_empty() {
        ("todos_verificados", true)
    } else {
        ("pendente", false)
    };

    database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! {
                "$set": {
                    "divergencia_campos": campos_bson,
                    "divergencia_campos_aceitos": campos_aceitos_bson,
                    "divergencia_email_status": status,
                    "divergencia_tratada": tratada,
                }
            },
        )
        .await
        .map_err(|e| format!("Erro ao salvar campos: {}", e))?;

    Ok("Campos de divergência atualizados".to_string())
}

/// Reverts a divergence back to pending state.
#[tauri::command]
async fn reverter_divergencia(orcamento_id: String) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let result = database
        .orcamentos
        .update_one(
            mongodb::bson::doc! { "_id": orcamento_oid },
            mongodb::bson::doc! {
                "$set": {
                    "divergencia_tratada": false,
                    "divergencia_email_status": "pendente",
                },
                "$unset": {
                    "divergencia_email_correcao": "",
                    "divergencia_email_enviado_em": "",
                    "divergencia_campos": "",
                    "divergencia_campos_aceitos": "",
                }
            },
        )
        .await
        .map_err(|e| format!("Erro ao reverter divergência: {}", e))?;

    if result.matched_count == 0 {
        return Err("Orçamento não encontrado".to_string());
    }
    Ok("Divergência revertida para pendente".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Carrega explicitamente do src-tauri/.env independente do cwd
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");
    dotenv::from_path(&env_path).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            add_orcamento,
            add_proposta,
            add_proposta_manual,
            registrar_nota_manual,
            add_transportadora,
            update_transportadora,
            delete_transportadora,
            get_orcamento,
            get_orcamento_detalhe,
            get_orcamentos,
            get_transportadoras,
            update_orcamento_basico,
            desativar_orcamento,
            reativar_orcamento,
            escolher_proposta_ganhadora,
            desfazer_proposta_ganhadora,
            delete_proposta,
            filter_orcamentos_by,
            get_gmail_inbox_status,
            call_gemini_api,
            get_dashboard_stats,
            get_orcamentos_recentes,
            get_dashboard_alertas,
            start_email_watcher,
            stop_email_watcher,
            get_watcher_status,
            get_emails_pendentes,
            associar_email_a_orcamento,
            descartar_email,
            excluir_orcamento,
            excluir_email,
            buscar_xml_orcamento,
            set_tray_divergencias,
            get_transportadora_metricas,
            google_auth_get_status,
            google_auth_start_login,
            google_auth_logout,
            get_notificacoes,
            marcar_notificacao_lida,
            excluir_notificacao,
            sync_notificacoes_divergencias,
            marcar_divergencia_tratada,
            migrar_divergencia_tratada,
            send_orcamento_request_email,
            comparar_cte_xml,
            enviar_email_divergencia,
            finalizar_divergencia,
            reverter_divergencia,
            salvar_campos_divergencia
        ])
        .setup(|app| {
            // Watcher state management
            let watcher = Arc::new(email_watcher::EmailWatcher::new());
            app.manage(watcher);
            let show_item = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Ultimax - Monitor de Fretes v1.0.1")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
