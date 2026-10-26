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
        let config = GIDConfiguration(clientID: clientId, serverClientID: clientId)
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

// 3. Patch @capacitor-firebase/authentication Package.swift for SPM Google trait compatibility
const packageSwiftFile = path.resolve(__dirname, '../node_modules/@capacitor-firebase/authentication/Package.swift');
if (fs.existsSync(packageSwiftFile)) {
  let pkgContent = fs.readFileSync(packageSwiftFile, 'utf8');
  let changed = false;

  if (pkgContent.includes('.product(name: "GoogleSignIn", package: "GoogleSignIn-iOS",\n                         condition: .when(traits: ["Google"]))')) {
    pkgContent = pkgContent.replace(
      '.product(name: "GoogleSignIn", package: "GoogleSignIn-iOS",\n                         condition: .when(traits: ["Google"]))',
      '.product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")'
    );
    changed = true;
  }

  if (pkgContent.includes('.define("RGCFA_INCLUDE_GOOGLE", .when(traits: ["Google"]))')) {
    pkgContent = pkgContent.replace(
      '.define("RGCFA_INCLUDE_GOOGLE", .when(traits: ["Google"]))',
      '.define("RGCFA_INCLUDE_GOOGLE")'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(packageSwiftFile, pkgContent, 'utf8');
    console.log('✅ Successfully patched @capacitor-firebase/authentication Package.swift to enable GoogleSignIn across all Swift versions.');
  } else {
    console.log('ℹ️ @capacitor-firebase/authentication Package.swift already contains unconditional GoogleSignIn definitions.');
  }
}
