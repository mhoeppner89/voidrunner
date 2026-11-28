import Foundation
@preconcurrency import WebKit

final class GameView: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let webView: WKWebView
    private let assets: GameAssets
    private lazy var nearby = Nearby { [weak self] event, done in
        guard let self, GameAssets.contains(self.webView.url),
              let data = try? JSONSerialization.data(withJSONObject: event),
              let text = String(data: data, encoding: .utf8) else { done(); return }
        self.webView.callAsyncJavaScript("window.__voidrunnerNativeReceive?.(message)",
            arguments: ["message": text], in: nil, in: .page) { _ in done() }
    }

    init(directory: URL) {
        assets = GameAssets(directory: directory)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        #if os(iOS)
        configuration.allowsInlineMediaPlayback = true
        #endif
        let source = """
        if (location.origin === '\(GameAssets.origin.absoluteString.dropLast())') {
            Object.defineProperty(window, 'VoidrunnerNative', { value: Object.freeze({
                postMessage(message) { window.webkit.messageHandlers.nearby.postMessage(message); }
            }) });
        }
        """
        configuration.userContentController.addUserScript(WKUserScript(source: source,
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        // The app delegate owns this view for the lifetime of the application.
        configuration.userContentController.add(self, name: "nearby")
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        #if os(iOS)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #endif
    }

    func start(onError: @escaping (String) -> Void) {
        do {
            try assets.start { [weak self] result in
                guard let self else { return }
                switch result {
                case .success:
                    self.webView.configuration.websiteDataStore.httpCookieStore.setCookie(self.assets.cookie) {
                        self.webView.load(URLRequest(url: GameAssets.origin, cachePolicy: .reloadIgnoringLocalCacheData))
                    }
                case .failure(let error): onError("Could not open the bundled game. \(error.localizedDescription)")
                }
            }
        } catch { onError("Could not open the bundled game. \(error.localizedDescription)") }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.webView === webView, message.frameInfo.isMainFrame,
              GameAssets.contains(message.frameInfo.request.url),
              let text = message.body as? String, text.utf8.count <= 7 * (1 << 20),
              let data = text.data(using: .utf8),
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        nearby.command(command)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let allow = action.targetFrame?.isMainFrame == true && GameAssets.contains(action.request.url)
        decisionHandler(allow ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { nearby.stop() }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        nearby.stop()
        webView.reload()
    }
}
