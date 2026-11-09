import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let web = WebViewController()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = web
        window.makeKeyAndVisible()
        self.window = window
        // geopend via een link naar zekerflex.com (universele link), bijv. de QR-code van "verder op je telefoon"
        if let activiteit = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }),
           let url = activiteit.webpageURL {
            web.open(url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL else { return }
        web.open(url)
    }
}
