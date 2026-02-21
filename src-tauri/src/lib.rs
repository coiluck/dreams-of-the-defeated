use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let store = app.store("settings.json")?;
            let is_fullscreen = store
            .get("settings")
            .and_then(|val| {
                val.get("screenSize")
                    .and_then(|size| size.as_str())
                    .map(|s| s == "fullscreen")
            })
            .unwrap_or(false);

            if let Some(window) = app.get_webview_window("main") {
                window.set_fullscreen(is_fullscreen).unwrap();
                window.show().unwrap();
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
