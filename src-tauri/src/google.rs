// Google's back-translation endpoint (translate_a/single: the translation back plus
// pronunciation), fetched natively. On macOS, WebKit rejects Google's reply to this request
// from the page (it fails its cross-origin check), so the page asks here instead. Windows
// still fetches it from the page; this is only called on macOS.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const HOST: &str = "translate.googleapis.com";

/// The raw JSON Google returns for translating `q` from `sl` to `tl`, with pronunciation.
#[tauri::command]
pub async fn google_single(sl: String, tl: String, q: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = format!(
            "/translate_a/single?client=gtx&sl={}&tl={}&dt=t&dt=rm",
            encode(&sl),
            encode(&tl)
        );
        post(&path, &format!("q={}", encode(&q)))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn post(path: &str, body: &str) -> Result<String, String> {
    let fail = |e: &dyn std::fmt::Display| format!("back-translation: {e}");
    let tcp = TcpStream::connect((HOST, 443)).map_err(|e| fail(&e))?;
    tcp.set_read_timeout(Some(Duration::from_secs(10))).map_err(|e| fail(&e))?;
    tcp.set_write_timeout(Some(Duration::from_secs(10))).map_err(|e| fail(&e))?;
    let connector = native_tls::TlsConnector::new().map_err(|e| fail(&e))?;
    let mut tls = connector.connect(HOST, tcp).map_err(|e| fail(&e))?;
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {HOST}\r\nContent-Type: application/x-www-form-urlencoded;charset=UTF-8\r\nContent-Length: {}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    tls.write_all(request.as_bytes()).map_err(|e| fail(&e))?;
    let mut raw = Vec::new();
    tls.read_to_end(&mut raw).map_err(|e| fail(&e))?;

    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").ok_or_else(|| fail(&"bad response"))?;
    let head = String::from_utf8_lossy(&raw[..split]).to_ascii_lowercase();
    let mut payload = raw[split + 4..].to_vec();
    let status = head.split_whitespace().nth(1).unwrap_or("");
    if status != "200" {
        return Err(fail(&format!("HTTP {status}")));
    }
    if head.contains("transfer-encoding: chunked") {
        payload = dechunk(&payload).ok_or_else(|| fail(&"bad chunked response"))?;
    }
    String::from_utf8(payload).map_err(|e| fail(&e))
}

// "Transfer-Encoding: chunked": hex size line, that many bytes, CRLF, … until a 0-size chunk.
fn dechunk(mut data: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    loop {
        let line_end = data.windows(2).position(|w| w == b"\r\n")?;
        let size_text = std::str::from_utf8(&data[..line_end]).ok()?;
        let size = usize::from_str_radix(size_text.split(';').next()?.trim(), 16).ok()?;
        data = &data[line_end + 2..];
        if size == 0 {
            return Some(out);
        }
        out.extend_from_slice(data.get(..size)?);
        data = data.get(size + 2..)?;
    }
}

// Percent-encoding for query strings and form bodies.
fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

