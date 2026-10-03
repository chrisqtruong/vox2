// Google's translate_a/single endpoint (the translation plus pronunciation), fetched natively on
// macOS for the pronunciation line (see checkBack in engines.js). Google refuses this endpoint
// from Vox2's web view and from a plain Rust TLS client (HTTP 429), but answers requests made
// through Apple's own networking (Foundation), so that's what this uses. Only called on macOS.

/// The raw JSON Google returns for translating `q` from `sl` to `tl`, with pronunciation.
#[tauri::command]
pub async fn google_single(sl: String, tl: String, q: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    return tauri::async_runtime::spawn_blocking(move || mac::get(&sl, &tl, &q))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (sl, tl, q);
        Err("only used on macOS".into())
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2_foundation::{NSData, NSString, NSURL};

    // A GET, so the text goes in the address: keep it to what addresses comfortably hold.
    const MAX_URL: usize = 8000;

    pub fn get(sl: &str, tl: &str, q: &str) -> Result<String, String> {
        let url = format!(
            "https://translate.googleapis.com/translate_a/single?client=gtx&sl={}&tl={}&dt=t&dt=rm&q={}",
            encode(sl),
            encode(tl),
            encode(q)
        );
        if url.len() > MAX_URL {
            return Err("pronunciation: text too long".into());
        }
        let url = NSURL::URLWithString(&NSString::from_str(&url)).ok_or("pronunciation: bad address")?;
        let data = NSData::dataWithContentsOfURL(&url).ok_or("pronunciation: no answer from Google")?;
        String::from_utf8(data.to_vec()).map_err(|e| e.to_string())
    }

    // Percent-encoding for the query string.
    fn encode(s: &str) -> String {
        s.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
                _ => format!("%{b:02X}"),
            })
            .collect()
    }
}

