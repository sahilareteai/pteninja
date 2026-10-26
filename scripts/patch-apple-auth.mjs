import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetFile = path.resolve(
  __dirname,
  '../node_modules/@capacitor-firebase/authentication/ios/Plugin/Handlers/AppleAuthProviderHandler.swift'
);

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');

  // Ensure authorizationController delegate guards do not silently return without rejecting the Capacitor call
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
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('✅ Successfully patched AppleAuthProviderHandler.swift with safe Capacitor rejection guards.');
  } else {
    console.log('ℹ️ AppleAuthProviderHandler.swift already patched or target pattern not found.');
  }
} else {
  console.log('ℹ️ AppleAuthProviderHandler.swift not present in node_modules, skipping patch.');
}
