//! Android push commands use Kotlin without keeping the webview alive.
#[cfg(target_os = "android")]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(target_os = "android")]
struct Push(PluginHandle<tauri::Wry>);

#[cfg(target_os = "android")]
pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("push")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.gulbidi.neptune", "PushPlugin")?;
            app.manage(Push(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn push_token(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    return app
        .state::<Push>()
        .0
        .run_mobile_plugin("getToken", ())
        .map_err(|e| e.to_string());
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::Value::Null)
    }
}

#[tauri::command]
pub async fn push_context(app: tauri::AppHandle, context: serde_json::Value) -> Result<(), String> {
    #[cfg(target_os = "android")]
    return app
        .state::<Push>()
        .0
        .run_mobile_plugin::<serde_json::Value>("setContext", context)
        .map(|_| ())
        .map_err(|e| e.to_string());
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, context);
        Ok(())
    }
}

#[tauri::command]
pub async fn push_open(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    return app
        .state::<Push>()
        .0
        .run_mobile_plugin("consumeOpen", ())
        .map_err(|e| e.to_string());
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::Value::Null)
    }
}
