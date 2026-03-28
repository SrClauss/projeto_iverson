use serde::{Deserialize, Serialize};
use mongodb::bson::oid::ObjectId;

fn default_true() -> bool {
    true
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
pub struct Orcamento {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub descricao: String,
    pub data_criacao: String,
    #[serde(default)]
    pub propostas: Vec<Proposta>,
    #[serde(default = "default_true")]
    pub ativo: bool,
    #[serde(default)]
    pub transportadora_id: Option<ObjectId>,
    #[serde(default)]
    pub proposta_ganhadora_id: Option<String>,
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
    pub valor_proposta: i32,
    pub valor_frete_pago: Option<i32>,
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

