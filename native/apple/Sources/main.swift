import Foundation

#if os(macOS)
import AppKit

final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var game: GameView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let gameView = GameView(directory: Bundle.main.resourceURL!.appendingPathComponent("dist"))
        game = gameView
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        self.window = window
        window.title = "Voidrunner"
        window.minSize = NSSize(width: 720, height: 440)
        window.contentView = gameView.webView
        window.backgroundColor = .black
        window.collectionBehavior = [.fullScreenPrimary]
        window.center()
        window.makeKeyAndOrderFront(nil)
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Voidrunner", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        // Native edit commands are needed for pilot names on a hardware keyboard.
        let edit = NSMenu(title: "Edit")
        let editItem = NSMenuItem()
        menu.addItem(editItem)
        editItem.submenu = edit
        for (name, key) in [("Cut", "x"), ("Copy", "c"), ("Paste", "v"), ("Select All", "a")] {
            edit.addItem(withTitle: name, action: NSSelectorFromString(name == "Select All" ? "selectAll:" : name.lowercased() + ":"), keyEquivalent: key)
        }
        NSApp.mainMenu = menu
        NSApp.activate(ignoringOtherApps: true)
        gameView.start { message in
            let alert = NSAlert()
            alert.messageText = "Voidrunner could not start"
            alert.informativeText = message
            alert.runModal()
            NSApp.terminate(nil)
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
let app = NSApplication.shared
let delegate = ApplicationDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()

#else
import UIKit

final class GameController: UIViewController {
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}

final class ApplicationDelegate: UIResponder, UIApplicationDelegate {
    // Reattaching a scene reuses the same local origin and game instance.
    private lazy var game = GameView(directory: Bundle.main.resourceURL!.appendingPathComponent("dist"))
    private var started = false

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Game", sessionRole: session.role)
        configuration.delegateClass = GameScene.self
        return configuration
    }

    func attach(to controller: GameController) {
        controller.view = game.webView
        guard !started else { return }
        started = true
        game.start { message in
            let alert = UIAlertController(title: "Voidrunner could not start", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            controller.present(alert, animated: true)
        }
    }
}

final class GameScene: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene, let app = UIApplication.shared.delegate as? ApplicationDelegate else { return }
        let controller = GameController()
        let window = UIWindow(windowScene: scene)
        self.window = window
        window.rootViewController = controller
        window.backgroundColor = .black
        window.makeKeyAndVisible()
        UIApplication.shared.isIdleTimerDisabled = true
        app.attach(to: controller)
    }
}
UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(ApplicationDelegate.self))
#endif
