// Reading the text in a screen snip with Apple's own text recognizer (Vision, the engine behind
// Live Text) on macOS. It reads screen text much more reliably than Tesseract, works offline and
// needs no download. Windows keeps Tesseract (resources/ocr.js); so does macOS when this fails or
// the snip's language isn't one Vision reads.

/// The text in the last snip. `langs`: Google language codes to expect, most likely first;
/// `detect`: the source box is on "detect language".
#[tauri::command]
pub async fn read_snip_text(langs: Vec<String>, detect: bool) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let png = crate::overlay::snip_png();
        if png.is_empty() {
            return Err("no snip".into());
        }
        return tauri::async_runtime::spawn_blocking(move || mac::read(&png, &langs, detect))
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (langs, detect);
        Err("only used on macOS".into())
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel};

    pub fn read(png: &[u8], langs: &[String], detect: bool) -> Result<String, String> {
        let req = VNRecognizeTextRequest::new();
        req.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        req.setUsesLanguageCorrection(true);

        // Vision reads a fixed set of languages (more in newer macOS). A source language it doesn't
        // read goes to Tesseract instead; on "detect", it reads whichever expected ones it can.
        let supported: Vec<String> = unsafe { req.supportedRecognitionLanguagesAndReturnError() }
            .map(|list| list.iter().map(|s| s.to_string()).collect())
            .unwrap_or_default();
        let mut picks: Vec<String> = Vec::new();
        for code in langs {
            if let Some(v) = vision_lang(code, &supported) {
                if !picks.contains(&v) {
                    picks.push(v);
                }
            } else if !detect {
                return Err(format!("Vision doesn't read {code}"));
            }
        }
        if picks.is_empty() {
            return Err("Vision doesn't read these languages".into());
        }
        let picks: Vec<_> = picks.iter().map(|s| NSString::from_str(s)).collect();
        req.setRecognitionLanguages(&NSArray::from_retained_slice(&picks));
        if detect && objc2::available!(macos = 13.0) {
            req.setAutomaticallyDetectsLanguage(true);
        }

        let handler = VNImageRequestHandler::initWithData_options(
            VNImageRequestHandler::alloc(),
            &NSData::with_bytes(png),
            &NSDictionary::new(),
        );
        let as_request: &VNRequest = &req;
        handler
            .performRequests_error(&NSArray::from_slice(&[as_request]))
            .map_err(|e| e.localizedDescription().to_string())?;

        // One result per line of text, top to bottom. A gap taller than about a line between two
        // lines is a new paragraph (blank line), so the page can rejoin each paragraph's lines.
        let Some(results) = req.results() else { return Ok(String::new()) };
        let mut out = String::new();
        let mut prev: Option<(f64, f64)> = None; // previous line's bottom and height
        for line in results.iter() {
            let Some(best) = line.topCandidates(1).firstObject() else { continue };
            // Normalized to the image, origin at the bottom left.
            let b = unsafe { line.boundingBox() };
            let (top, height) = (b.origin.y + b.size.height, b.size.height);
            if let Some((prev_bottom, prev_height)) = prev {
                out.push_str(if prev_bottom - top > 0.8 * prev_height.max(height) { "\n\n" } else { "\n" });
            }
            out.push_str(&best.string().to_string());
            prev = Some((b.origin.y, height));
        }
        Ok(out)
    }

    /// Google language code → the language tag Vision lists (e.g. "vi" → "vi-VT", "zh-CN" → "zh-Hans").
    fn vision_lang(code: &str, supported: &[String]) -> Option<String> {
        let want = match code {
            "zh-CN" => "zh-Hans",
            "zh-TW" => "zh-Hant",
            "iw" => "he",
            c => c.split('-').next().unwrap_or(c),
        };
        let prefix = format!("{want}-");
        supported.iter().find(|s| s.as_str() == want || s.starts_with(&prefix)).cloned()
    }
}
