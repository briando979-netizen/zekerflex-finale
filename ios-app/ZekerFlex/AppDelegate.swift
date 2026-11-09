import UIKit
import UserNotifications

/// ZekerFlex voor iPhone: de site in app-modus (WebViewController), met pushmeldingen
/// via Apple en het chiplezen via NFC (ChipLezer). Zie ios-app/README.md.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// De apparaatcode van Apple (hex). De webview stuurt hem naar /api/me/apns zodra je bent ingelogd.
    static var apnsToken: String? {
        didSet { NotificationCenter.default.post(name: .zfApnsToken, object: nil) }
    }

    /// Een tik op een melding terwijl de app nog niet klaar was: dit pad opent zodra hij er is.
    static var wachtendPad: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // al toestemming gegeven: bij elke start opnieuw aanmelden (Apple kan de code vervangen)
        UNUserNotificationCenter.current().getNotificationSettings { instellingen in
            guard instellingen.authorizationStatus == .authorized || instellingen.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        AppDelegate.apnsToken = deviceToken.map { String(format: "%02x", $0) }.joined()
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // geen meldingen (bijv. in de simulator): de app werkt verder gewoon
    }

    /// Een melding terwijl de app open is: toch laten zien.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    /// Een tik op een melding: naar het pad uit de melding ("url", zoals bij Web Push).
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let pad = response.notification.request.content.userInfo["url"] as? String {
            AppDelegate.wachtendPad = pad
            NotificationCenter.default.post(name: .zfOpenPad, object: pad)
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let zfApnsToken = Notification.Name("zfApnsToken")
    static let zfOpenPad = Notification.Name("zfOpenPad")
}

/// Een tekst uit Localizable.strings (nl, en, pl, ro, uk; zoals de werker-app).
func tekst(_ sleutel: String) -> String {
    NSLocalizedString(sleutel, comment: "")
}
