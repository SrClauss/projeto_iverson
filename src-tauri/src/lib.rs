// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

mod db;

#[tauri::command]
async fn add_orcamento(mut orcamento: db::models::Orcamento) -> Result<String, String> {
    let database = db::get_database().await?;  
    orcamento.id = None;

    database
        .orcamentos
        .insert_one(orcamento)
        .await
        .map_err(|e| format!("Erro ao salvar orçamento: {}", e))?;

    Ok("Orçamento adicionado com sucesso".to_string())
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



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            add_orcamento,
            add_proposta,
            add_transportadora,
            get_orcamento,
            get_orcamentos
        ])
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
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
