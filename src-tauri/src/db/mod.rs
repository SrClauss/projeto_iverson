use mongodb::{Client, Collection};
use std::env;
pub mod models;

fn resolve_db_uri() -> Result<String, String> {
    let db_uri = env::var("DB_URI")
        .or_else(|_| env::var("MONGO_URI"))
        .map_err(|_| "DB_URI/MONGO_URI não definida no ambiente".to_string())?;

    if db_uri.trim().is_empty() {
        return Err("DB_URI/MONGO_URI está vazia".to_string());
    }

    if db_uri.contains("<username>") || db_uri.contains("<password>") {
        return Err(
            "A URI do MongoDB ainda contém placeholders (<username>/<password>). Substitua pelos UserCreds reais do cluster.".to_string(),
        );
    }

    Ok(db_uri)
}

fn resolve_db_name(db_uri: &str) -> String {
    if let Ok(db_name) = env::var("DB_NAME") {
        let db_name = db_name.trim();
        if !db_name.is_empty() {
            return db_name.to_string();
        }
    }

    let without_query = db_uri.split('?').next().unwrap_or(db_uri);
    let candidate = without_query.rsplit('/').next().unwrap_or("iverson").trim();

    if candidate.is_empty() {
        "iverson".to_string()
    } else {
        candidate.to_string()
    }
}

pub struct Database {
    pub transportadoras: Collection<models::Transportadora>,
    pub orcamentos: Collection<models::Orcamento>,
    pub emails_processados: Collection<models::EmailProcessado>,
    pub watcher_state: Collection<models::WatcherState>,
}

impl Database {
    pub async fn new(uri: &str, db_name: &str) -> mongodb::error::Result<Self> {
        let client = Client::with_uri_str(uri).await?;
        let db = client.database(db_name);

        Ok(Self {
            transportadoras: db.collection("transportadoras"),
            orcamentos: db.collection("orcamentos"),
            emails_processados: db.collection("emails_processados"),
            watcher_state: db.collection("watcher_state"),
        })
    }
}

pub async fn get_database() -> Result<Database, String> {
    let db_uri = resolve_db_uri()?;
    let db_name = resolve_db_name(&db_uri);

    Database::new(&db_uri, &db_name)
        .await
        .map_err(|e| format!("Erro ao conectar: {}", e))
}



pub async fn connect_database() -> Result<String, String> {
    match get_database().await {
        Ok(_) => Ok("Conectado ao banco de dados com sucesso".to_string()),
        Err(e) => Err(e),
    }
}