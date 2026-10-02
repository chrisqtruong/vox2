// Read-aloud with Microsoft's neural voices (the free service behind Edge's "Read Aloud").
// Unofficial: it speaks the same WebSocket protocol Edge does (see github.com/rany2/edge-tts),
// so Microsoft could change it. Returns MP3 bytes for the page to play.

use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Response;
use tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_VERSION: &str = "143.0.3650.75";
const WSS_URL: &str = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const MAX_CHUNK_BYTES: usize = 3000; // the service rejects long requests; split by sentence

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

// Time-based token Edge sends: SHA-256 of (Windows file time rounded to 5 min) + client token.
fn sec_ms_gec() -> String {
    let mut secs = unix_now() + 11_644_473_600;
    secs -= secs % 300;
    let ticks = secs as u128 * 10_000_000;
    let hash = Sha256::digest(format!("{ticks}{TRUSTED_CLIENT_TOKEN}").as_bytes());
    hash.iter().map(|b| format!("{b:02X}")).collect()
}

fn hex_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

// JavaScript-style UTC date, which the service expects in X-Timestamp.
fn js_date() -> String {
    let secs = unix_now() as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Civil-from-days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    const DAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    format!(
        "{} {} {:02} {} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        DAYS[days.rem_euclid(7) as usize],
        MONTHS[(month - 1) as usize],
        day,
        year,
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

fn escape_xml(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(*c, '\u{0}'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}'))
        .map(|c| match c {
            '&' => "&amp;".into(),
            '<' => "&lt;".into(),
            '>' => "&gt;".into(),
            '"' => "&quot;".into(),
            '\'' => "&apos;".into(),
            c => c.to_string(),
        })
        .collect()
}

// Split long text at sentence ends (or spaces) so each request stays under the limit.
fn chunks(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for piece in text.split_inclusive(|c: char| matches!(c, '.' | '!' | '?' | '。' | '！' | '？' | '\n')) {
        if cur.len() + piece.len() > MAX_CHUNK_BYTES && !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
        if piece.len() > MAX_CHUNK_BYTES {
            for word in piece.split_inclusive(' ') {
                if cur.len() + word.len() > MAX_CHUNK_BYTES && !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
                cur.push_str(word);
            }
        } else {
            cur.push_str(piece);
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur);
    }
    out
}

fn synthesize(text: &str, voice: &str, rate: i32) -> Result<Vec<u8>, String> {
    let url = format!(
        "{WSS_URL}?TrustedClientToken={TRUSTED_CLIENT_TOKEN}&ConnectionId={}&Sec-MS-GEC={}&Sec-MS-GEC-Version=1-{CHROMIUM_VERSION}",
        hex_id(),
        sec_ms_gec()
    );
    let mut req = url.into_client_request().map_err(|e| e.to_string())?;
    let major = CHROMIUM_VERSION.split('.').next().unwrap_or("143");
    let headers = req.headers_mut();
    let ua = format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36 Edg/{major}.0.0.0");
    for (k, v) in [
        ("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold".to_string()),
        ("User-Agent", ua),
        ("Pragma", "no-cache".into()),
        ("Cache-Control", "no-cache".into()),
        ("Accept-Language", "en-US,en;q=0.9".into()),
        ("Cookie", format!("muid={};", hex_id().to_uppercase())),
    ] {
        headers.insert(k, HeaderValue::from_str(&v).map_err(|e| e.to_string())?);
    }
    let (mut ws, _) = tungstenite::connect(req).map_err(|e| format!("voice service: {e}"))?;

    ws.send(Message::text(format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n\
         {{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}\r\n",
        js_date()
    )))
    .map_err(|e| e.to_string())?;

    let mut audio = Vec::new();
    for part in chunks(text) {
        let ssml = format!(
            "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>\
             <voice name='{}'><prosody pitch='+0Hz' rate='{:+}%' volume='+0%'>{}</prosody></voice></speak>",
            escape_xml(voice),
            rate,
            escape_xml(&part)
        );
        ws.send(Message::text(format!(
            "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n{ssml}",
            hex_id(),
            js_date()
        )))
        .map_err(|e| e.to_string())?;
        loop {
            match ws.read().map_err(|e| format!("voice service: {e}"))? {
                Message::Text(t) if t.contains("Path:turn.end") => break,
                Message::Binary(data) if data.len() >= 2 => {
                    // [2-byte header length][headers][audio]
                    let header_len = u16::from_be_bytes([data[0], data[1]]) as usize;
                    let headers = String::from_utf8_lossy(&data[2..(2 + header_len).min(data.len())]);
                    if headers.contains("Path:audio") && 2 + header_len < data.len() {
                        audio.extend_from_slice(&data[2 + header_len..]);
                    }
                }
                Message::Close(_) => return Err("voice service closed the connection".into()),
                _ => {}
            }
        }
    }
    let _ = ws.close(None);
    if audio.is_empty() {
        return Err("voice service returned no audio (voice may not exist)".into());
    }
    Ok(audio)
}

/// rate: speed change in percent, e.g. -20 (slower) … +30 (faster).
#[tauri::command]
pub async fn tts_speak(text: String, voice: String, rate: i32) -> Result<Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || synthesize(&text, &voice, rate))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Response::new(bytes))
}
