use crate::cte_parser;
use crate::db;
use crate::gemini_client;
use crate::gmail_client::{self, GmailClient};
use mongodb::bson::oid::ObjectId;
use notify_rust::Notification;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Intervalo de polling em segundos
const POLL_INTERVAL_SECS: u64 = 30;

// ── Status do Watcher ────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct WatcherStatus {
    pub running: bool,
    pub last_check: Option<String>,
    pub emails_processados: u32,
    pub ultimo_erro: Option<String>,
}

// ── Email Watcher ────────────────────────────────────────────

pub struct EmailWatcher {
    is_running: Arc<AtomicBool>,
    status: Arc<Mutex<WatcherStatus>>,
}

impl EmailWatcher {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            status: Arc::new(Mutex::new(WatcherStatus {
                running: false,
                last_check: None,
                emails_processados: 0,
                ultimo_erro: None,
            })),
        }
    }

    pub fn start(&self) {
        if self.is_running.load(Ordering::SeqCst) {
            return; // Já rodando
        }

        self.is_running.store(true, Ordering::SeqCst);
        let is_running = self.is_running.clone();
        let status = self.status.clone();

        tokio::spawn(async move {
            println!("[EmailWatcher] Iniciado");

            // Carregar estado anterior do banco
            if let Ok(database) = db::get_database().await {
                if let Ok(Some(state)) = database
                    .watcher_state
                    .find_one(mongodb::bson::doc! {})
                    .await
                {
                    let mut s = status.lock().await;
                    s.emails_processados = state.total_processados;
                }
            }

            while is_running.load(Ordering::SeqCst) {
                let resultado = poll_once(&status).await;

                {
                    let mut s = status.lock().await;
                    s.running = is_running.load(Ordering::SeqCst);
                    s.last_check = Some(chrono::Utc::now().to_rfc3339());

                    if let Err(ref err) = resultado {
                        s.ultimo_erro = Some(err.clone());
                        eprintln!("[EmailWatcher] Erro no poll: {}", err);
                    } else {
                        s.ultimo_erro = None;
                    }
                }

                // Sleep em intervalos curtos para reagir rápido ao stop
                for _ in 0..(POLL_INTERVAL_SECS * 2) {
                    if !is_running.load(Ordering::SeqCst) {
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                }
            }

            {
                let mut s = status.lock().await;
                s.running = false;
            }

            println!("[EmailWatcher] Parado");
        });
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
        // Atualiza status imediatamente para o frontend ver
        let status = self.status.clone();
        tokio::spawn(async move {
            let mut s = status.lock().await;
            s.running = false;
        });
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub async fn get_status(&self) -> WatcherStatus {
        let mut s = self.status.lock().await;
        // Sempre sincronizar com o flag atômico real
        s.running = self.is_running.load(Ordering::SeqCst);
        s.clone()
    }
}

// ── Polling principal ────────────────────────────────────────

async fn poll_once(status: &Arc<Mutex<WatcherStatus>>) -> Result<(), String> {
    let database = db::get_database().await?;

    // 1. Carregar transportadoras
    let mut cursor = database
        .transportadoras
        .find(mongodb::bson::doc! {})
        .await
        .map_err(|e| format!("Erro ao buscar transportadoras: {}", e))?;

    let mut transportadoras: Vec<db::models::Transportadora> = Vec::new();
    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro cursor transportadoras: {}", e))?
    {
        let t = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro deserializar transportadora: {}", e))?;
        transportadoras.push(t);
    }

    if transportadoras.is_empty() {
        return Ok(()); // Nada para monitorar
    }

    // 2. Montar mapas de email → transportadora
    let mut email_to_transportadora: HashMap<String, (ObjectId, String, String)> = HashMap::new();
    // email_to_transportadora: email_lower → (id, nome, tipo: "orcamento"|"nota")

    for t in &transportadoras {
        if let Some(id) = t.id {
            let email_orc = t.email_orcamento.trim().to_lowercase();
            let email_nota = t.email_nota.trim().to_lowercase();

            if !email_orc.is_empty() {
                email_to_transportadora.insert(
                    email_orc.clone(),
                    (id, t.nome.clone(), "orcamento".to_string()),
                );
            }
            if !email_nota.is_empty() && email_nota != email_orc {
                email_to_transportadora.insert(
                    email_nota.clone(),
                    (id, t.nome.clone(), "nota".to_string()),
                );
            }
            // Se email_nota == email_orcamento, classificamos depois baseado no estado do orçamento
            if !email_nota.is_empty() && email_nota == email_orc {
                // Mantém como "orcamento" pela default, mas será reclassificável
                email_to_transportadora.insert(
                    email_orc,
                    (id, t.nome.clone(), "ambos".to_string()),
                );
            }
        }
    }

    if email_to_transportadora.is_empty() {
        return Ok(());
    }

    // 3. Montar query Gmail com todos os emails das transportadoras
    let emails_query: Vec<String> = email_to_transportadora
        .keys()
        .map(|e| format!("from:{}", e))
        .collect();
    let query = format!("({}) newer_than:1d", emails_query.join(" OR "));

    // 4. Autenticar e buscar emails
    let gmail = GmailClient::authenticate().await?;
    let message_ids = gmail.search_messages(&query, 20).await?;

    if message_ids.is_empty() {
        return Ok(());
    }

    // 5. Processar cada email
    for msg_id in &message_ids {
        // Verificar se já processado
        let ja_processado = database
            .emails_processados
            .find_one(mongodb::bson::doc! { "gmail_message_id": msg_id })
            .await
            .map_err(|e| format!("Erro ao verificar duplicata: {}", e))?;

        if ja_processado.is_some() {
            continue;
        }

        // Buscar mensagem completa
        let msg = match gmail.get_message(msg_id).await {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[EmailWatcher] Erro ao buscar msg {}: {}", msg_id, e);
                continue;
            }
        };

        let from = msg
            .payload
            .as_ref()
            .and_then(|p| gmail_client::get_header_value(p.headers.as_ref(), "From"))
            .unwrap_or_default();
        let email_remetente = gmail_client::extract_email_from_header(&from);

        let subject = msg
            .payload
            .as_ref()
            .and_then(|p| gmail_client::get_header_value(p.headers.as_ref(), "Subject"))
            .unwrap_or_default();

        // Match com transportadora
        let (transportadora_id, transportadora_nome, tipo_email) =
            match email_to_transportadora.get(&email_remetente) {
                Some(info) => info.clone(),
                None => continue, // Email não é de transportadora conhecida
            };

        let body = msg
            .payload
            .as_ref()
            .and_then(gmail_client::extract_plain_text_body)
            .or(msg.snippet.clone())
            .unwrap_or_default();

        let now_iso = chrono::Utc::now().to_rfc3339();

        // Determinar tipo real (se "ambos", verifica se há orçamento fechado com essa transportadora)
        let tipo_real = if tipo_email == "ambos" {
            classificar_tipo_email(&database, transportadora_id).await
        } else {
            tipo_email.clone()
        };

        match tipo_real.as_str() {
            "cotacao" | "orcamento" => {
                processar_cotacao(
                    &database,
                    &gmail,
                    msg_id,
                    &subject,
                    &body,
                    &from,
                    transportadora_id,
                    &transportadora_nome,
                    &now_iso,
                    status,
                )
                .await;
            }
            "nota" => {
                processar_nota(
                    &database,
                    &gmail,
                    msg_id,
                    &msg,
                    &subject,
                    &from,
                    transportadora_id,
                    &transportadora_nome,
                    &now_iso,
                    status,
                )
                .await;
            }
            _ => {
                // Tipo "ambos" sem classificação clara → trata como cotação
                processar_cotacao(
                    &database,
                    &gmail,
                    msg_id,
                    &subject,
                    &body,
                    &from,
                    transportadora_id,
                    &transportadora_nome,
                    &now_iso,
                    status,
                )
                .await;
            }
        }
    }

    Ok(())
}

/// Se a transportadora tem orçamento ATIVO com proposta ganhadora, tipo = "nota"
/// Senão, tipo = "orcamento" (cotação)
async fn classificar_tipo_email(database: &db::Database, transportadora_id: ObjectId) -> String {
    let has_ganhadora = database
        .orcamentos
        .find_one(mongodb::bson::doc! {
            "ativo": true,
            "proposta_ganhadora_id": { "$ne": null },
            "propostas.transportadora_id": transportadora_id
        })
        .await
        .ok()
        .flatten();

    if has_ganhadora.is_some() {
        "nota".to_string()
    } else {
        "orcamento".to_string()
    }
}

// ── Processamento de Cotação ─────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn processar_cotacao(
    database: &db::Database,
    _gmail: &GmailClient,
    msg_id: &str,
    subject: &str,
    body: &str,
    from: &str,
    transportadora_id: ObjectId,
    transportadora_nome: &str,
    now_iso: &str,
    status: &Arc<Mutex<WatcherStatus>>,
) {
    // 1. Buscar orçamentos ativos
    let orcamentos_ativos = buscar_orcamentos_ativos(database).await;

    if orcamentos_ativos.is_empty() {
        // Sem orçamentos ativos → registrar como erro, não tem onde colocar
        let email_doc = db::models::EmailProcessado {
            id: None,
            gmail_message_id: msg_id.to_string(),
            tipo: "cotacao".to_string(),
            transportadora_id,
            transportadora_nome: transportadora_nome.to_string(),
            orcamento_id: None,
            orcamento_descricao: None,
            processado_em: now_iso.to_string(),
            status: "erro".to_string(),
            valor_extraido: None,
            erro: Some("Nenhum orçamento ativo para receber esta cotação".to_string()),
            assunto: Some(subject.to_string()),
            remetente: Some(from.to_string()),
            prazo_extraido: None,
        };
        let _ = database.emails_processados.insert_one(email_doc).await;
        incrementar_contador(database, status).await;
        return;
    }

    // 2. Identificar orçamento — totalmente automático
    //    Se só tem 1 ativo, manda direto. Se tem vários, IA decide.
    let (orcamento_match, orcamento_desc) = if orcamentos_ativos.len() == 1 {
        // Só 1 orçamento ativo → vai direto, sem perguntar
        let (oid, desc) = &orcamentos_ativos[0];
        println!("[EmailWatcher] Só 1 orçamento ativo, enviando direto: {}", desc);
        (Some(*oid), Some(desc.clone()))
    } else {
        // Tentar match por substring primeiro
        let match_descricao = match_orcamento_por_descricao(subject, body, &orcamentos_ativos);
        if let Some((oid, desc)) = match_descricao {
            println!("[EmailWatcher] Match por substring: {}", desc);
            (Some(oid), Some(desc))
        } else {
            // IA decide — o prompt GARANTE que ela sempre escolhe
            let descricoes: Vec<String> = orcamentos_ativos.iter().map(|(_, d)| d.clone()).collect();
            match gemini_client::identificar_orcamento(subject, body, &descricoes).await {
                Ok(Some(desc_match)) => {
                    let oid = orcamentos_ativos
                        .iter()
                        .find(|(_, d)| d == &desc_match)
                        .map(|(id, _)| *id);
                    println!("[EmailWatcher] IA escolheu orçamento: {}", desc_match);
                    (oid, Some(desc_match))
                }
                Ok(None) | Err(_) => {
                    // Fallback: primeiro orçamento ativo
                    let (oid, desc) = &orcamentos_ativos[0];
                    println!("[EmailWatcher] Fallback para primeiro orçamento: {}", desc);
                    (Some(*oid), Some(desc.clone()))
                }
            }
        }
    };

    // 3. Extrair valor e prazo via Gemini — sempre executa
    let (valor_extraido, prazo_extraido) = match gemini_client::extrair_valor_cotacao(subject, body).await {
        Ok((v, p)) => (v, p),
        Err(e) => {
            eprintln!("[EmailWatcher] Erro Gemini cotação: {}", e);
            (None, None)
        }
    };

    // 4. Aplicar proposta automaticamente — sem confirmação
    let mut email_status = "erro".to_string();
    let mut erro_msg: Option<String> = None;

    if let Some(orcamento_oid) = orcamento_match {
        if let Some(valor) = valor_extraido {
            match criar_proposta_automatica(
                database,
                orcamento_oid,
                transportadora_id,
                valor,
                prazo_extraido.as_deref(),
            ).await {
                Ok(_) => {
                    email_status = "aplicado".to_string();
                    println!(
                        "[EmailWatcher] ✅ Proposta criada automaticamente: {} → R$ {:.2}",
                        transportadora_nome,
                        valor as f64 / 100.0
                    );
                }
                Err(e) => {
                    eprintln!("[EmailWatcher] Erro ao criar proposta: {}", e);
                    erro_msg = Some(e);
                }
            }
        } else {
            erro_msg = Some("IA não conseguiu extrair valor de frete do email".to_string());
        }
    }

    // 5. Salvar email processado (sempre registra, sem status "pendente")
    let email_doc = db::models::EmailProcessado {
        id: None,
        gmail_message_id: msg_id.to_string(),
        tipo: "cotacao".to_string(),
        transportadora_id,
        transportadora_nome: transportadora_nome.to_string(),
        orcamento_id: orcamento_match,
        orcamento_descricao: orcamento_desc,
        processado_em: now_iso.to_string(),
        status: email_status,
        valor_extraido,
        erro: erro_msg,
        assunto: Some(subject.to_string()),
        remetente: Some(from.to_string()),
        prazo_extraido,
    };

    let _ = database.emails_processados.insert_one(email_doc).await;
    incrementar_contador(database, status).await;
}

// ── Processamento de Nota ────────────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn processar_nota(
    database: &db::Database,
    gmail: &GmailClient,
    msg_id: &str,
    msg: &gmail_client::GmailMessageResponse,
    subject: &str,
    from: &str,
    transportadora_id: ObjectId,
    transportadora_nome: &str,
    now_iso: &str,
    status: &Arc<Mutex<WatcherStatus>>,
) {
    // 1. Buscar XMLs anexados
    let xml_attachments = msg
        .payload
        .as_ref()
        .map(gmail_client::collect_xml_attachment_ids)
        .unwrap_or_default();

    let mut valor_extraido: Option<i32> = None;
    let mut _cnpj_emitente: Option<String> = None;
    let mut descricao_carga: Option<String> = None;

    // 2. Tentar parse procedural de cada XML
    for (att_id, filename) in &xml_attachments {
        let xml_bytes = match gmail.get_attachment(msg_id, att_id).await {
            Ok(bytes) => bytes,
            Err(e) => {
                eprintln!("[EmailWatcher] Erro download XML {}: {}", filename, e);
                continue;
            }
        };

        match cte_parser::parse_cte_xml(&xml_bytes) {
            Ok(info) => {
                valor_extraido = Some(info.valor_frete_centavos);
                _cnpj_emitente = Some(info.cnpj_emitente);
                descricao_carga = Some(info.descricao_carga);
                break; // Primeiro XML com sucesso é suficiente
            }
            Err(e) => {
                eprintln!(
                    "[EmailWatcher] Erro parse XML {} — tentando Gemini: {}",
                    filename, e
                );
                // Fallback: enviar conteúdo ao Gemini
                let xml_text = String::from_utf8_lossy(&xml_bytes).to_string();
                if let Ok(Some(v)) = gemini_client::extrair_valor_nota_texto(&xml_text).await {
                    valor_extraido = Some(v);
                    break;
                }
            }
        }
    }

    // 3. Se sem XMLs, tentar extrair do corpo do email via Gemini
    if valor_extraido.is_none() && xml_attachments.is_empty() {
        let body = msg
            .payload
            .as_ref()
            .and_then(gmail_client::extract_plain_text_body)
            .or(msg.snippet.clone())
            .unwrap_or_default();

        if let Ok(Some(v)) = gemini_client::extrair_valor_nota_texto(&body).await {
            valor_extraido = Some(v);
        }
    }

    // 4. Auto-atribuir valor na proposta ganhadora
    let mut email_status = "erro".to_string();
    let mut orcamento_match: Option<ObjectId> = None;
    let mut orcamento_desc: Option<String> = None;
    let mut erro_msg: Option<String> = None;

    if let Some(valor) = valor_extraido {
        match aplicar_valor_frete_pago(database, transportadora_id, valor, descricao_carga.as_deref()).await {
            Ok(Some((oid, desc))) => {
                orcamento_match = Some(oid);
                orcamento_desc = Some(desc.clone());
                email_status = "aplicado".to_string();
                println!(
                    "[EmailWatcher] ✅ Nota aplicada automaticamente: {} → R$ {:.2} ({})",
                    transportadora_nome,
                    valor as f64 / 100.0,
                    desc
                );
            }
            Ok(None) => {
                erro_msg = Some("Nenhum orçamento ativo com ganhadora desta transportadora".to_string());
            }
            Err(e) => {
                eprintln!("[EmailWatcher] Erro ao aplicar frete pago: {}", e);
                erro_msg = Some(e);
            }
        }
    } else {
        erro_msg = Some("Não foi possível extrair valor de frete da nota/CT-e".to_string());
    }

    // 5. Salvar email processado
    let email_doc = db::models::EmailProcessado {
        id: None,
        gmail_message_id: msg_id.to_string(),
        tipo: "nota".to_string(),
        transportadora_id,
        transportadora_nome: transportadora_nome.to_string(),
        orcamento_id: orcamento_match,
        orcamento_descricao: orcamento_desc,
        processado_em: now_iso.to_string(),
        status: email_status,
        valor_extraido,
        erro: erro_msg,
        assunto: Some(subject.to_string()),
        remetente: Some(from.to_string()),
        prazo_extraido: None,
    };

    let _ = database.emails_processados.insert_one(email_doc).await;
    incrementar_contador(database, status).await;
}

// ── Funções auxiliares ───────────────────────────────────────

/// Busca orçamentos ativos e retorna lista de (ObjectId, descricao)
async fn buscar_orcamentos_ativos(database: &db::Database) -> Vec<(ObjectId, String)> {
    let mut cursor = match database
        .orcamentos
        .find(mongodb::bson::doc! { "ativo": true })
        .await
    {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut result = Vec::new();
    while cursor.advance().await.unwrap_or(false) {
        if let Ok(orc) = cursor.deserialize_current() {
            if let Some(id) = orc.id {
                result.push((id, orc.descricao));
            }
        }
    }
    result
}

/// Match de orçamento por substring da descricao no subject ou body
fn match_orcamento_por_descricao(
    subject: &str,
    body: &str,
    orcamentos: &[(ObjectId, String)],
) -> Option<(ObjectId, String)> {
    let subject_lower = subject.to_lowercase();
    let body_lower = body.to_lowercase();

    // Match exato no subject primeiro
    for (id, desc) in orcamentos {
        if subject_lower.contains(&desc.to_lowercase()) {
            return Some((*id, desc.clone()));
        }
    }

    // Match no body
    for (id, desc) in orcamentos {
        if body_lower.contains(&desc.to_lowercase()) {
            return Some((*id, desc.clone()));
        }
    }

    None
}

/// Cria uma proposta automaticamente a partir de dados extraídos de email
async fn criar_proposta_automatica(
    database: &db::Database,
    orcamento_id: ObjectId,
    transportadora_id: ObjectId,
    valor_centavos: i32,
    prazo: Option<&str>,
) -> Result<(), String> {
    let mut orcamento = database
        .orcamentos
        .find_one(mongodb::bson::doc! { "_id": orcamento_id })
        .await
        .map_err(|e| format!("Erro ao buscar orçamento: {}", e))?
        .ok_or("Orçamento não encontrado")?;

    if !orcamento.ativo {
        return Err("Orçamento inativo".to_string());
    }

    // Verificar se já existe proposta dessa transportadora
    let ja_existe = orcamento
        .propostas
        .iter()
        .any(|p| p.transportadora_id.as_ref() == Some(&transportadora_id));

    if ja_existe {
        return Err("Transportadora já tem proposta neste orçamento".to_string());
    }

    let hoje = chrono::Utc::now().format("%Y-%m-%d").to_string();

    let prazo_str = prazo
        .map(|p| p.to_string())
        .unwrap_or_else(|| "Via email - a confirmar".to_string());

    let proposta = db::models::Proposta {
        id: Some(ObjectId::new().to_hex()),
        valor_proposta: valor_centavos,
        valor_frete_pago: None,
        prazo_entrega: Some(prazo_str),
        transportadora_id: Some(transportadora_id),
        data_proposta: hoje,
        origem: "email".to_string(),
    };

    orcamento.propostas.push(proposta);

    database
        .orcamentos
        .replace_one(mongodb::bson::doc! { "_id": orcamento_id }, &orcamento)
        .await
        .map_err(|e| format!("Erro ao salvar proposta automática: {}", e))?;

    Ok(())
}

/// Aplica valor_frete_pago na proposta ganhadora do orçamento correto
async fn aplicar_valor_frete_pago(
    database: &db::Database,
    transportadora_id: ObjectId,
    valor_centavos: i32,
    descricao_carga: Option<&str>,
) -> Result<Option<(ObjectId, String)>, String> {
    // Buscar orçamentos ATIVOS com proposta ganhadora dessa transportadora
    let mut cursor = database
        .orcamentos
        .find(mongodb::bson::doc! {
            "ativo": true,
            "proposta_ganhadora_id": { "$ne": null }
        })
        .await
        .map_err(|e| format!("Erro ao buscar orçamentos com ganhadora: {}", e))?;

    let mut candidatos: Vec<db::models::Orcamento> = Vec::new();

    while cursor
        .advance()
        .await
        .map_err(|e| format!("Erro cursor orçamentos: {}", e))?
    {
        let orc = cursor
            .deserialize_current()
            .map_err(|e| format!("Erro desserializar: {}", e))?;

        // Verificar se a proposta ganhadora é desta transportadora
        if let Some(ref ganhadora_id) = orc.proposta_ganhadora_id {
            let is_match = orc.propostas.iter().any(|p| {
                p.id.as_deref() == Some(ganhadora_id.as_str())
                    && p.transportadora_id.as_ref() == Some(&transportadora_id)
                    && p.valor_frete_pago.is_none() // Só se ainda não preenchido
            });

            if is_match {
                candidatos.push(orc);
            }
        }
    }

    if candidatos.is_empty() {
        return Ok(None);
    }

    // Se tem descricao_carga, tenta match
    let orcamento = if candidatos.len() == 1 {
        candidatos.into_iter().next().unwrap()
    } else if let Some(desc) = descricao_carga {
        let desc_lower = desc.to_lowercase();
        match candidatos
            .iter()
            .position(|o| desc_lower.contains(&o.descricao.to_lowercase()))
        {
            Some(idx) => candidatos.into_iter().nth(idx).unwrap(),
            None => candidatos.into_iter().next().unwrap(), // Fallback: primeiro candidato
        }
    } else {
        // Múltiplos candidatos sem descricao → primeiro como fallback
        candidatos.into_iter().next().unwrap()
    };

    let orcamento_id = match orcamento.id {
        Some(id) => id,
        None => return Ok(None),
    };

    let ganhadora_id = match orcamento.proposta_ganhadora_id.as_ref() {
        Some(id) => id.clone(),
        None => return Ok(None),
    };

    // Atualizar valor_frete_pago na proposta ganhadora
    let mut orcamento_clone = orcamento.clone();
    for proposta in &mut orcamento_clone.propostas {
        if proposta.id.as_deref() == Some(&ganhadora_id) {
            proposta.valor_frete_pago = Some(valor_centavos);
            break;
        }
    }

    let mut divergencia_detectada = false;
    let mut proposta_nominal = 0;

    for proposta in &orcamento.propostas {
        if proposta.id.as_deref() == Some(&ganhadora_id) {
            proposta_nominal = proposta.valor_proposta;
            break;
        }
    }

    if proposta_nominal > 0 && proposta_nominal != valor_centavos {
        divergencia_detectada = true;
    }

    database
        .orcamentos
        .replace_one(
            mongodb::bson::doc! { "_id": orcamento_id },
            &orcamento_clone,
        )
        .await
        .map_err(|e| format!("Erro ao atualizar frete pago: {}", e))?;

    if divergencia_detectada {
        let title = "Divergência de Nota";
        let body = format!(
            "Orçamento '{}' - frete pago R$ {:.2} vs proposta R$ {:.2}",
            orcamento.descricao,
            valor_centavos as f64 / 100.0,
            proposta_nominal as f64 / 100.0
        );

        let _ = Notification::new()
            .summary(title)
            .body(&body)
            .show();

        println!("[EmailWatcher] Aviso divergência: {}", body);
    }

    Ok(Some((orcamento_id, orcamento.descricao.clone())))
}

async fn incrementar_contador(database: &db::Database, status: &Arc<Mutex<WatcherStatus>>) {
    let mut s = status.lock().await;
    s.emails_processados += 1;

    // Persistir no banco
    let _ = database
        .watcher_state
        .update_one(
            mongodb::bson::doc! {},
            mongodb::bson::doc! {
                "$set": {
                    "last_checked_ms": chrono::Utc::now().timestamp_millis(),
                    "total_processados": s.emails_processados as i64
                }
            },
        )
        .with_options(
            mongodb::options::UpdateOptions::builder()
                .upsert(true)
                .build(),
        )
        .await;
}
