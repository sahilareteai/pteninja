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
    fs.writeFileSync(appleFile, content, 'utf8');
    console.log('✅ Successfully patched AppleAuthProviderHandler.swift with safe Capacitor rejection guards.');
  } else {
    console.log('ℹ️ AppleAuthProviderHandler.swift already patched or target pattern not found.');
  }
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
        guard let controller = self.pluginImplementation.getPlugin().bridge?.viewController else {
            if isLink == true {
                self.pluginImplementation.handleFailedLink(message: "Unable to present Google Sign-In view controller.", error: nil)
            } else {
                self.pluginImplementation.handleFailedSignIn(message: "Unable to present Google Sign-In view controller.", error: nil)
            }
            return
        }
        let scopes = call.getArray("scopes", String.self) ?? []

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
    fs.writeFileSync(googleFile, gContent, 'utf8');
    console.log('✅ Successfully patched GoogleAuthProviderHandler.swift to eliminate silent hangs.');
  } else {
    console.log('ℹ️ GoogleAuthProviderHandler.swift already patched or target pattern not found.');
  }
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
  sContent = sContent.replace(/\nextension PluginConfig \{[\s\S]*?\n\}\n?/, '');
  fs.writeFileSync(statusBarPluginFile, sContent, 'utf8');
  console.log('✅ Successfully patched @capacitor/status-bar StatusBarPlugin.swift with safe getConfigValue calls.');
}

// 5. Patch @capacitor/splash-screen
const splashFile = path.resolve(__dirname, '../node_modules/@capacitor/splash-screen/ios/Sources/SplashScreenPlugin/SplashScreenPlugin.swift');
if (fs.existsSync(splashFile)) {
  let content = fs.readFileSync(splashFile, 'utf8');

  if (!content.includes('import UIKit')) {
    content = 'import UIKit\n' + content;
  }

  content = content.replace(
    'if let view = bridge?.viewController?.view {',
    'if let view = ((bridge as AnyObject).viewController as? UIViewController)?.view ?? webView?.superview {'
  );

  content = content.replaceAll(
    'call.reject("Unable to show Splash Screen")',
    '(call as AnyObject).reject?("Unable to show Splash Screen", nil, nil, nil)'
  );
  content = content.replaceAll(
    'call.reject("Unable to hide Splash Screen")',
    '(call as AnyObject).reject?("Unable to hide Splash Screen", nil, nil, nil)'
  );

  const settingsTargetPattern = /private func splashScreenSettings\(from call: CAPPluginCall\) -> SplashScreenSettings \{[\s\S]*?\n    \}/;
  const patchedSettingsImplementation = `private func splashScreenSettings(from call: CAPPluginCall) -> SplashScreenSettings {
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
    }`;

  if (settingsTargetPattern.test(content)) {
    content = content.replace(settingsTargetPattern, patchedSettingsImplementation);
  }

  const splashTargetPattern = /private func splashScreenConfig\(\) -> SplashScreenConfig \{[\s\S]*?\n    \}/;
  const patchedSplashImplementation = `private func splashScreenConfig() -> SplashScreenConfig {
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
    }`;

  if (splashTargetPattern.test(content)) {
    content = content.replace(splashTargetPattern, patchedSplashImplementation);
  }
  content = content.replace(/\nextension PluginConfig \{[\s\S]*?\n\}\n?/, '');
  if (!content.includes('static func color(fromHex: String)')) {
    content += `
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
  }
  fs.writeFileSync(splashFile, content, 'utf8');
  console.log('✅ Successfully patched @capacitor/splash-screen with safe getConfigValue calls, import UIKit, & color(fromHex:) extension.');
}


