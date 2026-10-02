// API keys live in the operating system's credential store, never in settings.json:
// Windows Credential Manager, or the macOS Keychain. Each key is one entry, named after its
// engine (e.g. "gemini") under the app's identifier.

const SERVICE: &str = "com.chris.translator";

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("invalid key name: {name}"));
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// An empty value removes the entry.
#[tauri::command]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let entry = entry(&name)?;
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(&value).map_err(|e| e.to_string())
}
