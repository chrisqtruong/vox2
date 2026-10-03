import AppKit
import WebKit
import UniformTypeIdentifiers
// Runs run.html (served from this folder at tauri://localhost) in WebKit; POST /save writes results.json.
let root = FileManager.default.currentDirectoryPath
final class Scheme: NSObject, WKURLSchemeHandler {
    func webView(_ w: WKWebView, start task: WKURLSchemeTask) {
        let path = task.request.url!.path
        if path == "/save" {
            try? task.request.httpBody?.write(to: URL(fileURLWithPath: root + "/results.json"))
            task.didReceive(HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didReceive(Data("ok".utf8)); task.didFinish(); return
        }
        let file = URL(fileURLWithPath: root + path)
        guard let data = try? Data(contentsOf: file) else { task.didFailWithError(URLError(.fileDoesNotExist)); return }
        let mime = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        task.didReceive(HTTPURLResponse(url: task.request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime])!)
        task.didReceive(data); task.didFinish()
    }
    func webView(_ w: WKWebView, stop task: WKURLSchemeTask) {}
}
let app = NSApplication.shared
let cfg = WKWebViewConfiguration()
cfg.setURLSchemeHandler(Scheme(), forURLScheme: "tauri")
let win = NSWindow(contentRect: .init(x: 0, y: 0, width: 500, height: 400), styleMask: [.titled], backing: .buffered, defer: false)
let web = WKWebView(frame: .init(x: 0, y: 0, width: 500, height: 400), configuration: cfg)
win.contentView = web; win.orderFrontRegardless()
web.load(URLRequest(url: URL(string: "tauri://localhost/run.html")!))
var last = ""
Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
    web.evaluateJavaScript("[window.__log || '', window.__done === true]") { r, _ in
        guard let a = r as? [Any], let log = a[0] as? String else { return }
        if log != last { print(log.dropFirst(last.count), terminator: ""); fflush(stdout); last = log }
        if (a[1] as? Bool) == true { exit(0) }
    }
}
DispatchQueue.main.asyncAfter(deadline: .now() + 1800) { print("timed out"); exit(1) }
app.run()
