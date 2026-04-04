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
    prazo_entrega: Option<String>,
    transportadora_id: Option<String>,
    transportadora_nome: Option<String>,
    data_proposta: String,
}

#[derive(Debug, Serialize)]
struct OrcamentoDetalheItem {
    id: String,
    descricao: String,
    data_criacao: String,
    ativo: bool,
    cnpj_pagador: Option<String>,
    cnpj_cpf_destino: Option<String>,
    cep_destino: Option<String>,
    endereco_destino: Option<String>,
    nota: Option<String>,
    valor_produto: Option<f64>,
    qtd_volumes: Option<u32>,
    volumes: Option<Vec<db::models::Volume>>,
    dimensoes: Option<db::models::Dimensoes>,
    peso: Option<f64>,
    peso_total: Option<f64>,
    transportadoras_enviadas: Vec<String>,
    proposta_ganhadora_id: Option<String>,
    propostas: Vec<PropostaDetalheItem>,
    divergencia_tratada: bool,
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
        data_criacao: orcamento.data_criacao,
        ativo: orcamento.ativo,
        cnpj_pagador: orcamento.cnpj_pagador,
        cnpj_cpf_destino: orcamento.cnpj_cpf_destino,
        cep_destino: orcamento.cep_destino,
        endereco_destino: orcamento.endereco_destino,
        nota: orcamento.nota,
        valor_produto: orcamento.valor_produto,
        qtd_volumes: orcamento.qtd_volumes,
        volumes: orcamento.volumes,
        dimensoes: orcamento.dimensoes,
        peso: orcamento.peso,
        peso_total: orcamento.peso_total,
        proposta_ganhadora_id: orcamento.proposta_ganhadora_id,
        propostas,
        transportadoras_enviadas: orcamento.transportadoras_enviadas,
        divergencia_tratada: orcamento.divergencia_tratada,
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
        .map_err(|_| "GOOGLE_CLIENT_ID não definido".to_string())?;
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .map_err(|_| "GOOGLE_CLIENT_SECRET não definido".to_string())?;

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
        0 => "iverson-app".to_string(),
        1 => "iverson-app - 1 nova notificação".to_string(),
        n => format!("iverson-app - {} novas notificações", n),
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
    descricao: String,
    data_criacao: String,
    cnpj_pagador: Option<String>,
    cnpj_cpf_destino: Option<String>,
    cep_destino: Option<String>,
    endereco_destino: Option<String>,
    nota: Option<String>,
    valor_produto: Option<f64>,
    qtd_volumes: Option<u32>,
    volumes: Option<Vec<db::models::Dimensoes>>,
    dimensoes: Option<db::models::Dimensoes>,
    peso: Option<f64>,
    peso_total: Option<f64>,
) -> Result<String, String> {
    let database = db::get_database().await?;
    let orcamento_oid = mongodb::bson::oid::ObjectId::parse_str(&orcamento_id)
        .map_err(|e| format!("ID de orçamento inválido: {}", e))?;

    let descricao = descricao.trim();
    let data_criacao = data_criacao.trim();

    if descricao.is_empty() || data_criacao.is_empty() {
        return Err("Descrição e data de criação são obrigatórias".to_string());
    }

    let mut set_doc = mongodb::bson::Document::new();
    set_doc.insert("descricao", descricao);
    set_doc.insert("data_criacao", data_criacao);
    set_doc.insert("cnpj_pagador", cnpj_pagador);
    set_doc.insert("cnpj_cpf_destino", cnpj_cpf_destino);
    set_doc.insert("cep_destino", cep_destino);
    set_doc.insert("endereco_destino", endereco_destino);
    set_doc.insert("nota", nota);
    set_doc.insert("valor_produto", valor_produto);
    set_doc.insert("qtd_volumes", qtd_volumes);
    set_doc.insert("peso", peso);
    set_doc.insert("peso_total", peso_total);
    if let Some(qtd) = qtd_volumes {
        set_doc.insert("qtd_volumes", qtd);
    }
    if let Some(total) = peso_total {
        set_doc.insert("peso_total", total);
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
    prazo_entrega: String,
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

    let prazo_entrega = prazo_entrega.trim().to_string();

    if prazo_entrega.is_empty() {
        return Err("Prazo de entrega é obrigatório".to_string());
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
                            "Olá {},\n\n\
                            Temos o prazer de informar que sua proposta para o orçamento \"{}\" foi aceita.\n\n\
                            Para darmos continuidade ao processo, solicitamos que nos envie:\n\
                            1. Dados bancários para pagamento (banco, agência, conta, CNPJ/CPF e razão social);\n\
                            2. Nota fiscal referente ao frete (CT-e ou NF-e).\n\n\
                            Por favor, responda este e-mail com as informações acima o mais breve possível.\n\n\
                            Obrigado e aguardamos seu retorno.\n",
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
            "Olá {},\n\nSolicito orçamento para os seguintes dados:\n\nDescrição: {}\nNota: {}\nValor do produto: {}\nPeso: {}\nCEP destino: {}\nEndereço destino: {}\nData de criação: {}\n\nPor favor, envie sua proposta com prazo e valor o mais breve possível.\n\nObrigado.",
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
        let proposta = db::models::Proposta {
            id: Some(mongodb::bson::oid::ObjectId::new().to_hex()),
            valor_proposta: valor as f64 / 100.0,
            valor_frete_pago: None,
            prazo_entrega: email.prazo_extraido.clone().or(Some("Via email".to_string())),
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
            send_orcamento_request_email
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
                .tooltip("iverson-app")
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
