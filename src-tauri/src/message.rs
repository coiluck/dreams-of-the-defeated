use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};
use tauri::Listener;
use tauri::async_runtime::channel;
use std::sync::{Arc, Mutex};

#[tauri::command]
pub async fn show_dialog(
    app: AppHandle,
    message: String,
    button_labels: Vec<String>,
) -> Result<usize, String> {
    let (tx, mut rx) = channel::<usize>(1);
    let tx = Arc::new(Mutex::new(Some(tx)));

    // 既存のdialogウィンドウが残っていたら先に閉じる
    if let Some(existing) = app.get_webview_window("dialog") {
        existing.close().map_err(|e| e.to_string())?;
    }

    let main_win = app
        .get_webview_window("main")
        .ok_or("main window not found".to_string())?;

    // メインウィンドウの操作を無効化
    main_win.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;

    // メインウィンドウの中心座標を計算
    let main_pos = main_win.outer_position().map_err(|e| e.to_string())?;
    let main_size = main_win.outer_size().map_err(|e| e.to_string())?;
    let scale = main_win.scale_factor().map_err(|e| e.to_string())?;

    let dialog_w = 420u32;
    let dialog_h = 220u32;
    // inner_sizeで指定した論理ピクセルを物理ピクセルに変換
    let dialog_phys_w = (dialog_w as f64 * scale) as i32;
    let dialog_phys_h = (dialog_h as f64 * scale) as i32;

    let center_x = main_pos.x + (main_size.width as i32 - dialog_phys_w) / 2;
    let center_y = main_pos.y + (main_size.height as i32 - dialog_phys_h) / 2;

    // メッセージとボタンラベルをURLパラメータで渡す（イベントタイミング問題を回避）
    // 標準ライブラリだけでパーセントエンコード
    let encoded_message: String = message
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => vec![b as char],
            _ => format!("%{:02X}", b).chars().collect(),
        })
        .collect();

    // button_labels を JSON 配列にシリアライズしてパーセントエンコード
    let labels_json = serde_json::to_string(&button_labels).map_err(|e| e.to_string())?;
    let encoded_labels: String = labels_json
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => vec![b as char],
            _ => format!("%{:02X}", b).chars().collect(),
        })
        .collect();

    let url_path = format!(
        "dialog.html?message={}&buttonLabels={}",
        encoded_message, encoded_labels
    );

    let builder = WebviewWindowBuilder::new(
        &app,
        "dialog",
        WebviewUrl::App(url_path.into()),
    )
    .title("")
    .inner_size(dialog_w as f64, dialog_h as f64)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .visible(false);  // 最初は非表示で作成し、左上に一瞬出るのを防ぐ

    // parentはResultを返すので別行でmap_err
    let builder = builder.parent(&main_win).map_err(|e| e.to_string())?;
    let dialog_window = builder.build().map_err(|e| e.to_string())?;

    // mainウィンドウの中央に配置してから表示・フォーカス
    dialog_window
        .set_position(tauri::PhysicalPosition::new(center_x, center_y))
        .map_err(|e| e.to_string())?;
    dialog_window.show().map_err(|e| e.to_string())?;
    dialog_window.set_focus().map_err(|e| e.to_string())?;

    // dialog-result イベントを待つ（押されたボタンのインデックスを受け取る）
    let tx_clone = tx.clone();
    dialog_window.once("dialog-result", move |event| {
        let index: usize = serde_json::from_str(event.payload()).unwrap_or(0);
        if let Ok(mut guard) = tx_clone.lock() {
            if let Some(sender) = guard.take() {
                let _ = tauri::async_runtime::spawn(async move {
                    let _ = sender.send(index).await;
                });
            }
        }
    });

    let result = rx.recv().await.ok_or_else(|| "Dialog closed without result".to_string());

    // メインウィンドウの操作を再度有効化
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_ignore_cursor_events(false);
        let _ = main.set_focus();
    }

    // ダイアログウィンドウを閉じる
    if let Some(dialog) = app.get_webview_window("dialog") {
        let _ = dialog.close();
    }

    result
}