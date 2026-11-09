import CoreNFC
import SafariServices
import UIKit
import UserNotifications
import WebKit

/// De site in app-modus: /start?utm_source=ios zet de app-cookies (middleware.ts), daarna
/// blijft alles van zekerflex.com in deze webview. Andere soorten links (tel:, mailto:,
/// WhatsApp) gaan naar het systeem, een nieuw venster (target=_blank) naar Safari.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let host = "zekerflex.com"

    private var webView: WKWebView!
    private let offline = UIView()
    private var naStart: URL?
    private var startGeladen = false
    private var laatsteToken: String?
    private var lichteBalk = true
    private var themaWacht: NSKeyValueObservation?
    private lazy var chip = ChipLezer(vc: self)

    /// Start altijd via /start (zet de app-cookies); chip=1 alleen als deze iPhone NFC kan lezen.
    static var startUrl: URL {
        var c = URLComponents()
        c.scheme = "https"
        c.host = host
        c.path = "/start"
        var q = [URLQueryItem(name: "utm_source", value: "ios")]
        if NFCTagReaderSession.readingAvailable { q.append(URLQueryItem(name: "chip", value: "1")) }
        c.queryItems = q
        return c.url ?? URL(string: "https://\(host)/start?utm_source=ios")!
    }

    static func isEigen(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let h = url.host?.lowercased() else { return false }
        return h == host || h == "www.\(host)"
    }

    /// Een pad uit een melding ("/dashboard/klussen") als adres op zekerflex.com; nooit een ander domein.
    static func url(pad: String) -> URL? {
        guard pad.hasPrefix("/"), !pad.hasPrefix("//") else { return nil }
        return URL(string: "https://\(host)\(pad)")
    }

    /// Een link van buiten (universele link, melding): in de app openen.
    func open(_ url: URL) {
        guard Self.isEigen(url) else {
            UIApplication.shared.open(url)
            return
        }
        if isViewLoaded, startGeladen {
            webView.load(URLRequest(url: url))
        } else {
            naStart = url
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { lichteBalk ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 12 / 255, green: 14 / 255, blue: 18 / 255, alpha: 1)

        let config = WKWebViewConfiguration()
        let versie = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        config.applicationNameForUserAgent = "ZekerFlexApp-iOS/\(versie)"
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(chip, name: "zfChip")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        let vernieuw = UIRefreshControl()
        vernieuw.addTarget(self, action: #selector(herlaad), for: .valueChanged)
        webView.scrollView.refreshControl = vernieuw

        // de kleur van de balk bovenin volgt de pagina (<meta name="theme-color">)
        themaWacht = webView.observe(\.themeColor, options: [.new]) { [weak self] wv, _ in
            let kleur = wv.themeColor
            Task { @MainActor in self?.volgKleur(kleur) }
        }

        bouwOffline()
        NotificationCenter.default.addObserver(self, selector: #selector(tokenBinnen), name: .zfApnsToken, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(padUitMelding(_:)), name: .zfOpenPad, object: nil)
        if let pad = AppDelegate.wachtendPad, let url = Self.url(pad: pad) {
            AppDelegate.wachtendPad = nil
            naStart = url
        }
        webView.load(URLRequest(url: Self.startUrl))
    }

    // MARK: - navigatie

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        switch url.scheme?.lowercased() ?? "" {
        case "https", "http", "about", "blob", "data":
            decisionHandler(.allow)
        default:
            // tel:, mailto:, sms:, whatsapp:, maps: … naar het systeem
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // een agenda-bestand (.ics): Safari biedt "zet in je agenda" aan
        if navigationResponse.response.mimeType == "text/calendar", let url = navigationResponse.response.url {
            toon(SFSafariViewController(url: url))
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offline.isHidden = true
        webView.scrollView.refreshControl?.endRefreshing()
        if !startGeladen {
            startGeladen = true
            if let volgende = naStart {
                naStart = nil
                webView.load(URLRequest(url: volgende))
                return
            }
        }
        vraagMeldingenAlsIngelogd()
        stuurTokenAlsIngelogd()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        toonOffline(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        toonOffline(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: - vensters, meldingen van de pagina, camera en microfoon

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if Self.isEigen(url) {
                webView.load(URLRequest(url: url))
            } else if url.scheme == "https" || url.scheme == "http" {
                toon(SFSafariViewController(url: url))
            } else {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: tekst("ok"), style: .default) { _ in completionHandler() })
        toon(a)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: tekst("annuleren"), style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: tekst("ok"), style: .default) { _ in completionHandler(true) })
        toon(a)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: tekst("annuleren"), style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: tekst("ok"), style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        toon(a)
    }

    /// Camera en microfoon (videobellen, de ID-scan) alleen voor zekerflex.com zelf.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let h = origin.host.lowercased()
        decisionHandler(h == Self.host || h == "www.\(Self.host)" ? .grant : .deny)
    }

    // MARK: - pushmeldingen

    /// Op de schermen van een ingelogd account (niet op de inlogpagina).
    private func ingelogd() -> Bool {
        guard let url = webView.url, Self.isEigen(url) else { return false }
        return ["/dashboard", "/werkgever", "/admin", "/sales", "/berichten"].contains { url.path == $0 || url.path.hasPrefix("\($0)/") }
    }

    /// De eerste keer na het inloggen om toestemming vragen (daarna nooit meer: dat beslist iOS).
    private func vraagMeldingenAlsIngelogd() {
        guard ingelogd() else { return }
        let centrum = UNUserNotificationCenter.current()
        centrum.getNotificationSettings { instellingen in
            guard instellingen.authorizationStatus == .notDetermined else { return }
            centrum.requestAuthorization(options: [.alert, .sound, .badge]) { toegestaan, _ in
                guard toegestaan else { return }
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
    }

    @objc private func tokenBinnen() {
        stuurTokenAlsIngelogd()
    }

    /// De apparaatcode naar /api/me/apns, vanuit de pagina zelf (met de eigen sessiecookie).
    private func stuurTokenAlsIngelogd() {
        guard ingelogd(), let token = AppDelegate.apnsToken, token != laatsteToken,
              token.allSatisfy({ $0.isHexDigit }) else { return }
        laatsteToken = token
        let js = "void fetch('/api/me/apns',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token:'\(token)'})}).catch(function(){})"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    @objc private func padUitMelding(_ melding: Notification) {
        guard let pad = melding.object as? String, let url = Self.url(pad: pad) else { return }
        AppDelegate.wachtendPad = nil
        open(url)
    }

    // MARK: - uiterlijk en geen verbinding

    private func volgKleur(_ kleur: UIColor?) {
        guard let kleur else { return }
        view.backgroundColor = kleur
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard kleur.getRed(&r, green: &g, blue: &b, alpha: &a) else { return }
        lichteBalk = (0.299 * r + 0.587 * g + 0.114 * b) < 0.55
        setNeedsStatusBarAppearanceUpdate()
    }

    @objc private func herlaad() {
        if webView.url == nil { webView.load(URLRequest(url: Self.startUrl)) } else { webView.reload() }
    }

    private func toonOffline(_ error: Error) {
        let e = error as NSError
        // zelf afgebroken (een nieuwe pagina, een download, een link naar een andere app): geen storing
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && (e.code == 102 || e.code == 101) { return }
        webView.scrollView.refreshControl?.endRefreshing()
        offline.isHidden = false
    }

    private func bouwOffline() {
        offline.backgroundColor = view.backgroundColor
        offline.isHidden = true
        offline.translatesAutoresizingMaskIntoConstraints = false
        let label = UILabel()
        label.text = tekst("offline")
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = .preferredFont(forTextStyle: .headline)
        let knop = UIButton(type: .system)
        knop.setTitle(tekst("opnieuw"), for: .normal)
        knop.titleLabel?.font = .preferredFont(forTextStyle: .body)
        knop.addTarget(self, action: #selector(herlaad), for: .touchUpInside)
        let stapel = UIStackView(arrangedSubviews: [label, knop])
        stapel.axis = .vertical
        stapel.spacing = 16
        stapel.translatesAutoresizingMaskIntoConstraints = false
        offline.addSubview(stapel)
        view.addSubview(offline)
        NSLayoutConstraint.activate([
            offline.topAnchor.constraint(equalTo: view.topAnchor),
            offline.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            offline.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offline.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stapel.centerYAnchor.constraint(equalTo: offline.centerYAnchor),
            stapel.leadingAnchor.constraint(equalTo: offline.leadingAnchor, constant: 32),
            stapel.trailingAnchor.constraint(equalTo: offline.trailingAnchor, constant: -32),
        ])
    }

    /// Iets tonen bovenop wat er al open is (een melding terwijl Safari open staat).
    func toon(_ vc: UIViewController) {
        var boven: UIViewController = self
        while let volgende = boven.presentedViewController { boven = volgende }
        boven.present(vc, animated: true)
    }
}
