use mongodb::{Client, Collection};
use std::env;
pub mod models;

pub struct Database {
    pub transportadoras: Collection<models::Transportadora>,
    pub orcamentos: Collection<models::Orcamento>,
}

impl Database {
    pub async fn new(uri: &str, db_name: &str) -> mongodb::error::Result<Self> {
        let client = Client::with_uri_str(uri).await?;
        let db = client.database(db_name);

        Ok(Self {
            transportadoras: db.collection("transportadoras"),
            orcamentos: db.collection("orcamentos"),
        })
    }
}

pub async fn get_database() -> Result<Database, String> {
    let db_uri = env::var("DB_URI")
        .map_err(|_| "DB_URI não definida no ambiente".to_string())?;

    if db_uri.trim().is_empty() {
        return Err("DB_URI está vazia".to_string());
    }

    Database::new(&db_uri, "iverson_db")
        .await
        .map_err(|e| format!("Erro ao conectar: {}", e))
}



pub async fn connect_database() -> Result<String, String> {
    match get_database().await {
        Ok(_) => Ok("Conectado ao banco de dados com sucesso".to_string()),
        Err(e) => Err(e),
    }
}