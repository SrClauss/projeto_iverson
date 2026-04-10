use serde::{Deserialize, Serialize};
use mongodb::bson::oid::ObjectId;

fn default_true() -> bool {
    true
}

fn default_false() -> bool {
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transportadora {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub nome: String,
    pub cnpj: String,
    pub telefone: String,
    pub email_orcamento: String,
    pub email_nota: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dimensoes {
    pub comprimento: f64,
    pub largura: f64,
    pub altura: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Volume {
    pub comprimento: f64,
    pub largura: f64,
    pub altura: f64,
    #[serde(default)]
    pub peso: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Orcamento {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub descricao: String,
    #[serde(default)]
    pub numero_nota: Option<String>,
    #[serde(default)]
    pub numero_cotacao: Option<String>,
    pub data_criacao: String,
    #[serde(default)]
    pub cnpj_pagador: Option<String>,
    #[serde(default)]
    pub cnpj_cpf_destino: Option<String>,
    #[serde(default)]
    pub cep_destino: Option<String>,
    #[serde(default)]
    pub logradouro_destino: Option<String>,
    #[serde(default)]
    pub numero_destino: Option<String>,
    #[serde(default)]
    pub bairro_destino: Option<String>,
    #[serde(default)]
    pub cidade_destino: Option<String>,
    #[serde(default)]
    pub uf_destino: Option<String>,
    #[serde(default)]
    pub endereco_destino: Option<String>,
    #[serde(default)]
    pub nota: Option<String>,
    #[serde(default)]
    pub valor_produto: Option<f64>,
    #[serde(default)]
    pub qtd_volumes: Option<u32>,
    #[serde(default)]
    pub volumes: Option<Vec<Volume>>,
    #[serde(default)]
    pub dimensoes: Option<Dimensoes>,
    #[serde(default)]
    pub peso: Option<f64>,
    #[serde(default)]
    pub peso_total: Option<f64>,
    #[serde(default)]
    pub transportadoras_enviadas: Vec<String>,
    #[serde(default)]
    pub propostas: Vec<Proposta>,
    #[serde(default = "default_true")]
    pub ativo: bool,
    #[serde(default)]
    pub transportadora_id: Option<ObjectId>,
    #[serde(default)]
    pub proposta_ganhadora_id: Option<String>,
    /// true = sem divergência pendente ou divergência já tratada; false = divergência aberta
    #[serde(default = "default_false")]
    pub divergencia_tratada: bool,
    /// "pendente" | "email_enviado" | "correcao_recebida" | "finalizada"
    #[serde(default = "default_divergencia_status")]
    pub divergencia_email_status: String,
    /// Campos identificados como divergentes
    #[serde(default)]
    pub divergencia_campos: Vec<String>,
    /// Conteúdo do email de correção recebido da transportadora
    #[serde(default)]
    pub divergencia_email_correcao: Option<String>,
    /// Timestamp ISO de quando o email de divergência foi enviado
    #[serde(default)]
    pub divergencia_email_enviado_em: Option<String>,
}

fn default_divergencia_status() -> String {
    "pendente".to_string()
}

impl Orcamento {
    pub fn adicionar_proposta(&mut self, proposta: Proposta) -> Result<(), String> {
        let transportadora_id = proposta
            .transportadora_id
            .as_ref()
            .ok_or_else(|| "Transportadora é obrigatória na proposta".to_string())?;

        let prazo_valido = proposta
            .prazo_entrega
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);

        if !prazo_valido {
            return Err("Prazo de entrega é obrigatório na proposta".to_string());
        }

        let existe_proposta_da_transportadora = self
            .propostas
            .iter()
            .any(|item| item.transportadora_id.as_ref() == Some(transportadora_id));

        if existe_proposta_da_transportadora {
            return Err("Uma transportadora só pode ter uma proposta por orçamento".to_string());
        }

        self.propostas.push(proposta);
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposta {
    #[serde(default)]
    pub id: Option<String>,
    pub valor_proposta: f64,
    pub valor_frete_pago: Option<f64>,
    pub prazo_entrega: Option<String>,
    pub transportadora_id: Option<ObjectId>,
    pub data_proposta: String,
    /// "manual" ou "email" — como esta proposta foi criada
    #[serde(default = "default_origem_manual")]
    pub origem: String,
}

fn default_origem_manual() -> String {
    "manual".to_string()
}

// ── Email Processado ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailProcessado {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// ID da mensagem no Gmail
    pub gmail_message_id: String,
    /// "cotacao" ou "nota"
    pub tipo: String,
    /// Transportadora que enviou o email
    pub transportadora_id: ObjectId,
    /// Nome da transportadora (para exibição)
    pub transportadora_nome: String,
    /// Orçamento associado (se já matched)
    #[serde(default)]
    pub orcamento_id: Option<ObjectId>,
    /// Descrição do orçamento associado (para exibição)
    #[serde(default)]
    pub orcamento_descricao: Option<String>,
    /// Timestamp ISO de quando foi processado
    pub processado_em: String,
    /// "pendente", "aplicado", "descartado", "erro"
    pub status: String,
    /// Valor extraído em centavos (quando possível)
    #[serde(default)]
    pub valor_extraido: Option<i32>,
    /// Mensagem de erro (se status = "erro")
    #[serde(default)]
    pub erro: Option<String>,
    /// Assunto do email
    #[serde(default)]
    pub assunto: Option<String>,
    /// Remetente do email
    #[serde(default)]
    pub remetente: Option<String>,
    /// Prazo extraído (para cotações)
    #[serde(default)]
    pub prazo_extraido: Option<String>,
}

// ── Notificacao ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notificacao {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// ID do orçamento relacionado
    pub orcamento_id: ObjectId,
    /// Descrição do orçamento (para exibição)
    pub orcamento_descricao: String,
    /// Mensagem descrevendo a divergência
    pub mensagem: String,
    /// Se o usuário já leu
    #[serde(default)]
    pub lida: bool,
    /// Timestamp ISO de criação
    pub criada_em: String,
}

// ── Watcher State ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatcherState {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    /// Timestamp epoch millis do último check
    pub last_checked_ms: i64,
    /// Total de emails processados desde sempre
    pub total_processados: u32,
}

