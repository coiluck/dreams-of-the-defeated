use tauri::Manager;
use tauri_plugin_store::StoreExt;

mod map_store;
mod wars_front;
mod wars_logistics;
mod wars_advance;
mod wars_occupation;

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

            // マップデータを読み込む
            let resource_dir = app.path().resource_dir()
                .expect("Failed to get resource dir");
            let map_store = map_store::MapStore::load(
                &resource_dir.join("assets/map/map_data.bin").to_string_lossy(),
                &resource_dir.join("assets/map/map_meta.json").to_string_lossy(),
                &resource_dir.join("assets/map/map_cores.json").to_string_lossy(),
            ).expect("Failed to load map data");
            app.manage(map_store);

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            map_store::update_occupation,
            wars_front::get_war_fronts,
            wars_advance::calc_advance,
            wars_occupation::advance_occupation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
