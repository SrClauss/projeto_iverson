use serde::{Deserialize, Serialize};
use mongodb::bson::oid::ObjectId;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transportadora {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub nome: String,
    pub cnpj: String,
    pub telefone: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Orcamento {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub descricao: String,
    pub valor: f64,
    pub transportadora_id: Option<ObjectId>,
    pub data_criacao: String,
    #[serde(default)]
    pub propostas: Vec<Proposta>,
}

impl Orcamento {
    pub fn adicionar_proposta(&mut self, proposta: Proposta) -> Result<(), String> {
        let transportadora_id = proposta
            .transportadora_id
            .ok_or_else(|| "Cada proposta deve informar a transportadora".to_string())?;

        let existe_proposta_da_transportadora = self
            .propostas
            .iter()
            .any(|item| item.transportadora_id == Some(transportadora_id));

        if existe_proposta_da_transportadora {
            return Err("Uma transportadora só pode ter uma proposta por orçamento".to_string());
        }

        self.propostas.push(proposta);
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposta {
    pub valor_proposta: i32,
    pub valor_frete_pago: Option<i32>,
    pub prazo_entrega: Option<String>,
    pub transportadora_id: Option<ObjectId>,
    pub data_proposta: String,
    
}
