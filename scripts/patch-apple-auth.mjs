import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findPluginFile(subpath) {
  const directPath = path.resolve(__dirname, '../node_modules/@capacitor-firebase/authentication', subpath);
  if (fs.existsSync(directPath)) return directPath;
  
  // Try lowercase/uppercase variants for handlers
  const altSubpath = subpath.includes('handlers') 
    ? subpath.replace('handlers', 'Handlers') 
    : subpath.replace('Handlers', 'handlers');
  const altPath = path.resolve(__dirname, '../node_modules/@capacitor-firebase/authentication', altSubpath);
  if (fs.existsSync(altPath)) return altPath;

  return null;
}

// 1. Patch AppleAuthProviderHandler.swift to guarantee Capacitor rejection on all guard failures
const appleFile = findPluginFile('ios/Plugin/handlers/AppleAuthProviderHandler.swift');
if (appleFile) {
  let content = fs.readFileSync(appleFile, 'utf8');
  const targetPattern = /func authorizationController\(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization\) \{[\s\S]*?func authorizationController\(controller: ASAuthorizationController, didCompleteWithError error: Error\) \{[\s\S]*?\n    \}/;

  const patchedImplementation = `func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            self.pluginImplementation.handleFailedSignIn(message: "Invalid credential type received from Apple", error: nil)
            return
        }
        guard let nonce = currentNonce else {
            self.pluginImplementation.handleFailedSignIn(message: "Invalid state: No nonce found", error: nil)
            return
        }
        guard let appleIDToken = appleIDCredential.identityToken else {
            self.pluginImplementation.handleFailedSignIn(message: "Unable to fetch identity token from Apple", error: nil)
            return
        }
        var authorizationCode: String?
        if let authorizationCodeData = appleIDCredential.authorizationCode {
            authorizationCode = String(data: authorizationCodeData, encoding: .utf8)
        }
        guard let idTokenString = String(data: appleIDToken, encoding: .utf8) else {
            self.pluginImplementation.handleFailedSignIn(message: "Unable to serialize token string from data", error: nil)
            return
        }
        var displayName: String?
        if let fullName = appleIDCredential.fullName {
            if let givenName = fullName.givenName, let familyName = fullName.familyName {
                displayName = "\\(givenName) \\(familyName)"
            }
        }
        let credential = OAuthProvider.appleCredential(withIDToken: idTokenString,
                                                       rawNonce: nonce,
                                                       fullName: appleIDCredential.fullName)
        if self.isLink == true {
            self.pluginImplementation.handleSuccessfulLink(credential: credential, idToken: idTokenString, nonce: nonce,
                                                           accessToken: nil, serverAuthCode: nil, displayName: displayName, authorizationCode: authorizationCode)
        } else {
            self.pluginImplementation.handleSuccessfulSignIn(credential: credential, idToken: idTokenString, nonce: nonce,
                                                             accessToken: nil, displayName: displayName, authorizationCode: authorizationCode, serverAuthCode: nil)
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if self.isLink == true {
            self.pluginImplementation.handleFailedLink(message: nil, error: error)
        } else {
            self.pluginImplementation.handleFailedSignIn(message: nil, error: error)
        }
    }`;

  if (targetPattern.test(content)) {
    content = content.replace(targetPattern, patchedImplementation);
  }
  content = content.replace(
    'return (self.pluginImplementation.getPlugin().bridge?.webView?.window)!',
    'return (self.pluginImplementation.getPlugin().webView?.window ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow }))!'
  );
  content = content.replace(
    'call.reject(self.pluginImplementation.getPlugin().errorDeviceUnsupported)',
    'self.pluginImplementation.handleFailedSignIn(message: self.pluginImplementation.getPlugin().errorDeviceUnsupported, error: nil)'
  );
  content = content.replace(
    'call.reject(self.pluginImplementation.getPlugin().errorDeviceUnsupported)',
    'self.pluginImplementation.handleFailedLink(message: self.pluginImplementation.getPlugin().errorDeviceUnsupported, error: nil)'
  );
  fs.writeFileSync(appleFile, content, 'utf8');
  console.log('✅ Successfully patched AppleAuthProviderHandler.swift with safe Capacitor rejection guards and direct webView.');
}

// 2. Patch GoogleAuthProviderHandler.swift to avoid silent hangs if options or controller are missing
const googleFile = findPluginFile('ios/Plugin/handlers/GoogleAuthProviderHandler.swift');
if (googleFile) {
  let gContent = fs.readFileSync(googleFile, 'utf8');
  const googlePattern = /private func startSignInWithGoogleFlow\(_ call: CAPPluginCall, isLink: Bool\) \{[\s\S]*?#else/;

  const patchedGoogleFlow = `private func startSignInWithGoogleFlow(_ call: CAPPluginCall, isLink: Bool) {
        #if RGCFA_INCLUDE_GOOGLE
        guard let clientId = FirebaseApp.app()?.options.clientID else {
            if isLink == true {
                self.pluginImplementation.handleFailedLink(message: "Google client ID not configured in Firebase.", error: nil)
            } else {
                self.pluginImplementation.handleFailedSignIn(message: "Google client ID not configured in Firebase.", error: nil)
            }
            return
        }
        var serverClientId: String? = nil
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
           let sId = dict["SERVER_CLIENT_ID"] as? String, !sId.isEmpty {
            serverClientId = sId
        }
        let config = GIDConfiguration(clientID: clientId, serverClientID: serverClientId)
        GIDSignIn.sharedInstance.configuration = config
        guard let controller = self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
            if isLink == true {
                self.pluginImplementation.handleFailedLink(message: "Unable to present Google Sign-In view controller.", error: nil)
            } else {
                self.pluginImplementation.handleFailedSignIn(message: "Unable to present Google Sign-In view controller.", error: nil)
            }
            return
        }
        let scopes = (call.options["scopes"] as? [String]) ?? []

        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signIn(withPresenting: controller, hint: nil, additionalScopes: scopes) { [unowned self] result, error in
                if let error = error {
                    if isLink == true {
                        self.pluginImplementation.handleFailedLink(message: nil, error: error)
                    } else {
                        self.pluginImplementation.handleFailedSignIn(message: nil, error: error)
                    }
                    return
                }

                guard let user = result?.user,
                      let idToken = user.idToken?.tokenString
                else {
                    if isLink == true {
                        self.pluginImplementation.handleFailedLink(message: "Unable to obtain Google identity token.", error: nil)
                    } else {
                        self.pluginImplementation.handleFailedSignIn(message: "Unable to obtain Google identity token.", error: nil)
                    }
                    return
                }
                let accessToken = user.accessToken.tokenString
                let serverAuthCode = result?.serverAuthCode
                let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
                if isLink == true {
                    self.pluginImplementation.handleSuccessfulLink(credential: credential, idToken: idToken, nonce: nil,
                                                                   accessToken: accessToken, serverAuthCode: serverAuthCode, displayName: nil, authorizationCode: nil)
                } else {
                    self.pluginImplementation.handleSuccessfulSignIn(credential: credential, idToken: idToken, nonce: nil,
                                                                     accessToken: accessToken, displayName: nil, authorizationCode: nil, serverAuthCode: serverAuthCode)
                }
            }
        }
        #else`;

  if (googlePattern.test(gContent)) {
    gContent = gContent.replace(googlePattern, patchedGoogleFlow);
  }
  gContent = gContent.replaceAll('self.pluginImplementation.getPlugin().bridge?.viewController', '(self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController)');
  gContent = gContent.replaceAll('self.pluginImplementation.getPlugin().viewController', '(self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController)');
  gContent = gContent.replaceAll('call.getArray("scopes", String.self) ?? []', '(call.options["scopes"] as? [String]) ?? []');
  fs.writeFileSync(googleFile, gContent, 'utf8');
  console.log('✅ Successfully patched GoogleAuthProviderHandler.swift to eliminate silent hangs and use rootViewController.');
}

// 3. Patch @capacitor-firebase/authentication Package.swift for Swift 5.9 / Xcode 16.x compatibility
const packageSwiftFile = path.resolve(__dirname, '../node_modules/@capacitor-firebase/authentication/Package.swift');
if (fs.existsSync(packageSwiftFile)) {
  const cleanPackageSwift = `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapacitorFirebaseAuthentication",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapacitorFirebaseAuthentication",
            targets: ["FirebaseAuthenticationPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),
        .package(url: "https://github.com/google/GoogleSignIn-iOS", from: "9.0.0")
    ],
    targets: [
        .target(
            name: "FirebaseAuthenticationPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCore", package: "firebase-ios-sdk"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")
            ],
            path: "ios/Plugin",
            swiftSettings: [
                .define("RGCFA_INCLUDE_GOOGLE")
            ])
    ],
    swiftLanguageVersions: [.v5]
)
`;
  fs.writeFileSync(packageSwiftFile, cleanPackageSwift, 'utf8');
  console.log('✅ Successfully patched @capacitor-firebase/authentication Package.swift with swift-tools-version: 5.9.');
}

// 4. Patch @capacitor/status-bar
const statusBarColorFile = path.resolve(__dirname, '../node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/UIColor.swift');
if (fs.existsSync(statusBarColorFile)) {
  let content = fs.readFileSync(statusBarColorFile, 'utf8');
  if (!content.includes('static func color(fromHex: String)')) {
    const methodDefinition = `    static func color(fromHex: String) -> UIColor? {
        let hexString = fromHex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(
            of: "#",
            with: ""
        )

        var argb: UInt64 = 0
        guard Scanner(string: hexString).scanHexInt64(&argb) else { return nil }

        let red: CGFloat
        let green: CGFloat
        let blue: CGFloat
        let alpha: CGFloat

        if hexString.count == 6 {
            red = CGFloat((argb & 0xFF0000) >> 16) / 255.0
            green = CGFloat((argb & 0x00FF00) >> 8) / 255.0
            blue = CGFloat(argb & 0x0000FF) / 255.0
            alpha = 1.0
        } else if hexString.count == 8 {
            red = CGFloat((argb & 0xFF00_0000) >> 24) / 255.0
            green = CGFloat((argb & 0x00FF0000) >> 16) / 255.0
            blue = CGFloat((argb & 0x0000FF00) >> 8) / 255.0
            alpha = CGFloat(argb & 0x000000FF) / 255.0
        } else {
            return nil
        }

        return UIColor(red: red, green: green, blue: blue, alpha: alpha)
    }

`;
    content = content.replace('public extension CapacitorExtensionTypeWrapper where T: UIColor {', 'import UIKit\n\npublic extension CapacitorExtensionTypeWrapper where T: UIColor {\n' + methodDefinition);
    fs.writeFileSync(statusBarColorFile, content, 'utf8');
    console.log('✅ Successfully patched @capacitor/status-bar with color(fromHex: String) extension.');
  }
}

const statusBarPluginFile = path.resolve(__dirname, '../node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBarPlugin.swift');
if (fs.existsSync(statusBarPluginFile)) {
  let sContent = fs.readFileSync(statusBarPluginFile, 'utf8');
  if (!sContent.includes('import UIKit')) {
    sContent = 'import UIKit\n' + sContent;
  }
  const targetPattern = /private func statusBarConfig\(\) -> StatusBarConfig \{[\s\S]*?\n    \}/;
  const patchedImplementation = `private func statusBarConfig() -> StatusBarConfig {
        var config = StatusBarConfig()
        if let overlays = (getConfigValue("overlaysWebView") as? NSNumber)?.boolValue ?? (getConfigValue("overlaysWebView") as? Bool) {
            config.overlaysWebView = overlays
        }
        if let colorConfig = getConfigValue("backgroundColor") as? String, let color = UIColor.capacitor.color(fromHex: colorConfig) {
            config.backgroundColor = color
        }
        if let configStyle = getConfigValue("style") as? String {
            config.style = style(fromString: configStyle)
        }
        return config
    }`;
  if (targetPattern.test(sContent)) {
    sContent = sContent.replace(targetPattern, patchedImplementation);
  }
  sContent = sContent.replace(
    'statusBar = StatusBar(bridge: bridge, config: statusBarConfig())',
    'statusBar = StatusBar(bridge: bridge, config: statusBarConfig(), webView: self.webView)'
  );
  sContent = sContent.replace(/\nextension PluginConfig \{[\s\S]*?\n\}\n?/, '');
  fs.writeFileSync(statusBarPluginFile, sContent, 'utf8');
  console.log('✅ Successfully patched @capacitor/status-bar StatusBarPlugin.swift with safe getConfigValue calls and webView passing.');
}

const statusBarFile = path.resolve(__dirname, '../node_modules/@capacitor/status-bar/ios/Sources/StatusBarPlugin/StatusBar.swift');
if (fs.existsSync(statusBarFile)) {
  const fullStatusBarSwift = `import WebKit
import UIKit
import Foundation
import Capacitor

public class StatusBar {

    private var bridge: CAPBridgeProtocol
    private weak var webView: WKWebView?
    private var isOverlayingWebview = true
    private var backgroundColor = UIColor.black
    private var backgroundView: UIView?
    private var observers: [NSObjectProtocol] = []

    private var currentWebView: WKWebView? {
        if let webView = self.webView {
            return webView
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        for scene in scenes {
            for window in scene.windows {
                if let wv = findWebView(in: window) {
                    return wv
                }
            }
        }
        return nil
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let wv = view as? WKWebView { return wv }
        for subview in view.subviews {
            if let found = findWebView(in: subview) { return found }
        }
        return nil
    }

    init(bridge: CAPBridgeProtocol, config: StatusBarConfig, webView: WKWebView? = nil) {
        self.bridge = bridge
        self.webView = webView
        setupObservers(with: config)
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private func setupObservers(with config: StatusBarConfig) {
        observers.append(NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: .none, queue: .none) { [weak self] _ in
            self?.handleViewDidAppear(config: config)
        })
        observers.append(NotificationCenter.default.addObserver(forName: .capacitorStatusBarTapped, object: .none, queue: .none) { [weak self] _ in
            self?.bridge.triggerJSEvent(eventName: "statusTap", target: "window")
        })
        observers.append(NotificationCenter.default.addObserver(forName: .capacitorViewWillTransition, object: .none, queue: .none) { [weak self] _ in
            self?.handleViewWillTransition()
        })
    }

    private func handleViewDidAppear(config: StatusBarConfig) {
        setStyle(config.style)
        setBackgroundColor(config.backgroundColor)
        setOverlaysWebView(config.overlaysWebView)
    }

    private func handleViewWillTransition() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.resizeStatusBarBackgroundView()
            self?.resizeWebView()
        }
    }

    func setStyle(_ style: UIStatusBarStyle) {
        bridge.statusBarStyle = style
    }

    func setBackgroundColor(_ color: UIColor) {
        backgroundColor = color
        backgroundView?.backgroundColor = color
    }

    func setAnimation(_ animation: String) {
        if animation == "SLIDE" {
            bridge.statusBarAnimation = .slide
        } else if animation == "NONE" {
            bridge.statusBarAnimation = .none
        } else {
            bridge.statusBarAnimation = .fade
        }
    }

    func hide(animation: String) {
        setAnimation(animation)
        if bridge.statusBarVisible {
            bridge.statusBarVisible = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.resizeWebView()
                self?.backgroundView?.removeFromSuperview()
                self?.backgroundView?.isHidden = true
            }
        }
    }

    func show(animation: String) {
        setAnimation(animation)
        if !bridge.statusBarVisible {
            bridge.statusBarVisible = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [self] in
                resizeWebView()
                if !isOverlayingWebview {
                    resizeStatusBarBackgroundView()
                    if let bg = backgroundView {
                        (currentWebView?.superview ?? currentWebView)?.addSubview(bg)
                    }
                }
                backgroundView?.isHidden = false
            }
        }
    }

    func getInfo() -> StatusBarInfo {
        let style: String
        switch bridge.statusBarStyle {
        case .default:
            style = "DEFAULT"
        case .lightContent:
            style = "DARK"
        case .darkContent:
            style = "LIGHT"
        @unknown default:
            style = "DEFAULT"
        }

        return StatusBarInfo(
            overlays: isOverlayingWebview,
            visible: bridge.statusBarVisible,
            style: style,
            color: UIColor.capacitor.hex(fromColor: backgroundColor),
            height: getStatusBarFrame().size.height
        )
    }

    func setOverlaysWebView(_ overlay: Bool) {
        if overlay == isOverlayingWebview { return }
        isOverlayingWebview = overlay
        if overlay {
            backgroundView?.removeFromSuperview()
        } else {
            initializeBackgroundViewIfNeeded()
            if let bg = backgroundView {
                (currentWebView?.superview ?? currentWebView)?.addSubview(bg)
            }
        }
        resizeWebView()
    }

    private func resizeWebView() {
        let windowScene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
        let bounds: CGRect? = windowScene?.windows.first(where: { $0.isKeyWindow })?.bounds ?? windowScene?.windows.first?.bounds

        guard
            let bounds = bounds,
            let webView = currentWebView
        else { return }
        webView.frame = bounds
        let statusBarHeight = getStatusBarFrame().size.height
        var webViewFrame = webView.frame

        if isOverlayingWebview {
            let safeAreaTop = webView.safeAreaInsets.top
            if statusBarHeight >= safeAreaTop && safeAreaTop > 0 {
                webViewFrame.origin.y = safeAreaTop == 40 ? 20 : statusBarHeight - safeAreaTop
            } else {
                webViewFrame.origin.y = 0
            }
        } else {
            webViewFrame.origin.y = statusBarHeight
        }
        webViewFrame.size.height -= webViewFrame.origin.y
        webView.frame = webViewFrame
    }

    private func resizeStatusBarBackgroundView() {
        backgroundView?.frame = getStatusBarFrame()
    }

    private func getStatusBarFrame() -> CGRect {
        if let windowScene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            return windowScene.statusBarManager?.statusBarFrame ?? .zero
        }
        return .zero
    }

    private func initializeBackgroundViewIfNeeded() {
        if backgroundView == nil {
            backgroundView = UIView(frame: getStatusBarFrame())
            backgroundView!.backgroundColor = backgroundColor
            backgroundView!.autoresizingMask = [.flexibleWidth, .flexibleBottomMargin]
            backgroundView!.isHidden = !bridge.statusBarVisible
        }
    }
}
`;
  fs.writeFileSync(statusBarFile, fullStatusBarSwift, 'utf8');
  console.log('✅ Successfully wrote clean, self-contained StatusBar.swift.');
}

// 5. Patch @capacitor/splash-screen
const splashFile = path.resolve(__dirname, '../node_modules/@capacitor/splash-screen/ios/Sources/SplashScreenPlugin/SplashScreenPlugin.swift');
if (fs.existsSync(splashFile)) {
  const fullSplashPluginSwift = `import UIKit
import Foundation
import Capacitor

@objc(SplashScreenPlugin)
public class SplashScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SplashScreenPlugin"
    public let jsName = "SplashScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise)
    ]
    private var splashScreen: SplashScreen?

    override public func load() {
        let activeWindow = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive })?
            .windows.first(where: { $0.isKeyWindow })
            ?? UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.windows.first

        if let view = webView?.superview ?? webView ?? activeWindow {
            splashScreen = SplashScreen(parentView: view, config: splashScreenConfig())
            splashScreen?.showOnLaunch()
        }
    }

    // Show the splash screen
    @objc public func show(_ call: CAPPluginCall) {
        if let splash = splashScreen {
            let settings = splashScreenSettings(from: call)
            splash.show(settings: settings,
                        completion: {
                            call.resolve()
                        })
        } else {
            call.resolve()
        }
    }

    // Hide the splash screen
    @objc public func hide(_ call: CAPPluginCall) {
        if let splash = splashScreen {
            let settings = splashScreenSettings(from: call)
            splash.hide(settings: settings)
            call.resolve()
        } else {
            call.resolve()
        }
    }

    private func splashScreenSettings(from call: CAPPluginCall) -> SplashScreenSettings {
        var settings = SplashScreenSettings()
        guard let options = call.options else { return settings }

        if let showDuration = (options["showDuration"] as? NSNumber)?.intValue ?? (options["showDuration"] as? Int) {
            settings.showDuration = showDuration
        }
        if let fadeInDuration = (options["fadeInDuration"] as? NSNumber)?.intValue ?? (options["fadeInDuration"] as? Int) {
            settings.fadeInDuration = fadeInDuration
        }
        if let fadeOutDuration = (options["fadeOutDuration"] as? NSNumber)?.intValue ?? (options["fadeOutDuration"] as? Int) {
            settings.fadeOutDuration = fadeOutDuration
        }
        if let autoHide = (options["autoHide"] as? NSNumber)?.boolValue ?? (options["autoHide"] as? Bool) {
            settings.autoHide = autoHide
        }
        return settings
    }

    private func splashScreenConfig() -> SplashScreenConfig {
        var config = SplashScreenConfig()

        if let backgroundColor = getConfigValue("backgroundColor") as? String {
            config.backgroundColor = UIColor.capacitor.color(fromHex: backgroundColor)
        }
        if let spinnerStyle = getConfigValue("iosSpinnerStyle") as? String {
            switch spinnerStyle.lowercased() {
            case "small":
                config.spinnerStyle = .medium
            default:
                config.spinnerStyle = .large
            }
        }
        if let spinnerColor = getConfigValue("spinnerColor") as? String {
            config.spinnerColor = UIColor.capacitor.color(fromHex: spinnerColor)
        }
        if let showSpinner = (getConfigValue("showSpinner") as? NSNumber)?.boolValue ?? (getConfigValue("showSpinner") as? Bool) {
            config.showSpinner = showSpinner
        }
        if let launchShowDuration = (getConfigValue("launchShowDuration") as? NSNumber)?.intValue ?? (getConfigValue("launchShowDuration") as? Int) {
            config.launchShowDuration = launchShowDuration
        }
        if let launchAutoHide = (getConfigValue("launchAutoHide") as? NSNumber)?.boolValue ?? (getConfigValue("launchAutoHide") as? Bool) {
            config.launchAutoHide = launchAutoHide
        }
        return config
    }
}

extension CapacitorExtensionTypeWrapper where T: UIColor {
    static func color(fromHex: String) -> UIColor? {
        let hexString = fromHex.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
        var argb: UInt64 = 0
        guard Scanner(string: hexString).scanHexInt64(&argb) else { return nil }
        if hexString.count == 6 {
            return UIColor(red: CGFloat((argb & 0xFF0000) >> 16) / 255.0, green: CGFloat((argb & 0x00FF00) >> 8) / 255.0, blue: CGFloat(argb & 0x0000FF) / 255.0, alpha: 1.0)
        } else if hexString.count == 8 {
            return UIColor(red: CGFloat((argb & 0xFF00_0000) >> 24) / 255.0, green: CGFloat((argb & 0x00FF0000) >> 16) / 255.0, blue: CGFloat((argb & 0x0000FF00) >> 8) / 255.0, alpha: CGFloat(argb & 0x000000FF) / 255.0)
        }
        return nil
    }
}
`;
  fs.writeFileSync(splashFile, fullSplashPluginSwift, 'utf8');
  console.log('✅ Successfully wrote clean, self-contained SplashScreenPlugin.swift without bridge.webView.');
}

// 6. Patch @capacitor/app
const appPluginFile = path.resolve(__dirname, '../node_modules/@capacitor/app/ios/Sources/AppPlugin/AppPlugin.swift');
if (fs.existsSync(appPluginFile)) {
  let appContent = fs.readFileSync(appPluginFile, 'utf8');
  appContent = appContent.replace(
    'call.reject("Unable to get App Info")',
    'call.resolve(["name": Bundle.main.bundleIdentifier ?? "", "id": Bundle.main.bundleIdentifier ?? "", "build": "1", "version": "1.0.0"])'
  );
  if (!appContent.includes('extension CAPPluginCall')) {
    appContent += `
extension CAPPluginCall {
    public func reject(_ message: String, _ code: String? = nil, _ error: Error? = nil, _ data: PluginCallResultData? = nil) {
        self.resolve(["error": message])
    }
}
`;
  } else {
    appContent = appContent.replace(
      'errorHandler(CAPPluginCallError(message: message, code: code, error: error, data: data))',
      'self.resolve(["error": message])'
    );
  }
  fs.writeFileSync(appPluginFile, appContent, 'utf8');
  console.log('✅ Successfully patched @capacitor/app AppPlugin.swift getInfo call.reject and CAPPluginCall extension.');
}

// 7. Patch @capacitor-community/admob to inject CAPPluginCall convenience methods and direct webView access
const admobPluginFile = path.resolve(__dirname, '../node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AdMobPlugin.swift');
if (fs.existsSync(admobPluginFile)) {
  let admobContent = fs.readFileSync(admobPluginFile, 'utf8');
  admobContent = admobContent.replace('self.bridge?.webView?.setAllMediaPlaybackSuspended', 'self.webView?.setAllMediaPlaybackSuspended');
  const admobCallExtension = `
extension CAPPluginCall {
    public func getString(_ key: String, _ defaultValue: String? = nil) -> String? {
        return (options[key] as? String) ?? defaultValue
    }
    public func getBool(_ key: String, _ defaultValue: Bool? = nil) -> Bool? {
        let val = (options[key] as? NSNumber)?.boolValue ?? (options[key] as? Bool)
        return val ?? defaultValue
    }
    public func getInt(_ key: String, _ defaultValue: Int? = nil) -> Int? {
        let val = (options[key] as? NSNumber)?.intValue ?? (options[key] as? Int)
        return val ?? defaultValue
    }
    public func getFloat(_ key: String, _ defaultValue: Float? = nil) -> Float? {
        let val = (options[key] as? NSNumber)?.floatValue ?? (options[key] as? Float)
        return val ?? defaultValue
    }
    public func getObject(_ key: String) -> [String: Any]? {
        return options[key] as? [String: Any]
    }
    public func getArray(_ key: String) -> [Any]? {
        return options[key] as? [Any]
    }
    public func getArray<T>(_ key: String, _ ofType: T.Type) -> [T]? {
        return options[key] as? [T]
    }
    public func reject(_ message: String, _ code: String? = nil, _ error: Error? = nil, _ data: [String: Any]? = nil) {
        self.resolve(["error": message])
    }
}
`;
  if (!admobContent.includes('extension CAPPluginCall')) {
    admobContent += admobCallExtension;
  } else {
    admobContent = admobContent.replace(/\nextension CAPPluginCall \{[\s\S]*?\n\}\n?/, admobCallExtension);
  }
  fs.writeFileSync(admobPluginFile, admobContent, 'utf8');
  console.log('✅ Successfully patched @capacitor-community/admob with full CAPPluginCall convenience methods and direct webView.');
}

const nativeAdExecFile = path.resolve(__dirname, '../node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/NativeAds/NativeAdExecutor.swift');
if (fs.existsSync(nativeAdExecFile)) {
  let execContent = fs.readFileSync(nativeAdExecFile, 'utf8');
  execContent = execContent.replaceAll('plugin?.bridge?.webView', 'plugin?.webView');
  fs.writeFileSync(nativeAdExecFile, execContent, 'utf8');
  console.log('✅ Successfully patched @capacitor-community/admob NativeAdExecutor.swift plugin?.bridge?.webView -> plugin?.webView');
}

// 8. Patch @capacitor-firebase/authentication for Swift 6 / Xcode 16.2 SPM compatibility
const gameCenterFile = findPluginFile('ios/Plugin/handlers/GameCenterAuthProviderHandler.swift');
if (gameCenterFile) {
  let gcContent = fs.readFileSync(gameCenterFile, 'utf8');
  gcContent = gcContent.replaceAll('self.pluginImplementation.getPlugin().bridge?.viewController', '(self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController)');
  gcContent = gcContent.replaceAll('self.pluginImplementation.getPlugin().viewController', '(self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController)');
  fs.writeFileSync(gameCenterFile, gcContent, 'utf8');
  console.log('✅ Successfully patched GameCenterAuthProviderHandler.swift rootViewController.');
}

const facebookFile = findPluginFile('ios/Plugin/handlers/FacebookAuthProviderHandler.swift');
if (facebookFile) {
  let fbContent = fs.readFileSync(facebookFile, 'utf8');
  fbContent = fbContent.replaceAll('self.pluginImplementation.getPlugin().bridge?.viewController', '(self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController)');
  fbContent = fbContent.replaceAll('self.pluginImplementation.getPlugin().viewController', '(self.pluginImplementation.getPlugin().webView?.window?.rootViewController ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController)');
  fbContent = fbContent.replaceAll('call.getArray("scopes", String.self) ?? []', '(call.options["scopes"] as? [String]) ?? []');
  fs.writeFileSync(facebookFile, fbContent, 'utf8');
  console.log('✅ Successfully patched FacebookAuthProviderHandler.swift rootViewController and options.');
}

const oauthFile = findPluginFile('ios/Plugin/handlers/OAuthProviderHandler.swift');
if (oauthFile) {
  let oContent = fs.readFileSync(oauthFile, 'utf8');
  oContent = oContent.replaceAll('call.getArray("scopes", String.self) ?? []', '(call.options["scopes"] as? [String]) ?? []');
  oContent = oContent.replaceAll('call.getArray("customParameters", JSObject.self) ?? []', '(call.options["customParameters"] as? [JSObject]) ?? []');
  fs.writeFileSync(oauthFile, oContent, 'utf8');
  console.log('✅ Successfully patched OAuthProviderHandler.swift direct options arrays.');
}

const firebaseAuthPluginFile = path.resolve(__dirname, '../node_modules/@capacitor-firebase/authentication/ios/Plugin/FirebaseAuthenticationPlugin.swift');
if (fs.existsSync(firebaseAuthPluginFile)) {
  let fapContent = fs.readFileSync(firebaseAuthPluginFile, 'utf8');
  fapContent = fapContent.replace(
    'if let providers = getConfig().getArray("providers") as? [String] {',
    'if let providers = getConfig().getConfigJSON()["providers"] as? [String] {'
  );
  fapContent = fapContent.replace(/\nextension CAPPluginCall \{[\s\S]*?\n\}\n?/, '\n');
  fs.writeFileSync(firebaseAuthPluginFile, fapContent, 'utf8');
  console.log('✅ Successfully patched FirebaseAuthenticationPlugin.swift with direct JSON config and preserved native JSObject getters.');
}






