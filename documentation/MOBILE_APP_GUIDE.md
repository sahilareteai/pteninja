# PTE Ninja — Mobile App Build & Release Guide

PTE Ninja is powered by **Capacitor 8**, wrapping the modern React frontend into native Android and iOS mobile containers.

---

## 1. Pre-Built Release Binaries

The release binaries for version **1.0.0** have been built and signed:

| Artifact | Location | Target Platform | Size |
| :--- | :--- | :--- | :--- |
| **Release APK** | `release/pteninja-v1.0.0-release.apk` | Direct Android device installation & testing | ~4.5 MB |
| **Release AAB Bundle** | `release/pteninja-v1.0.0-release.aab` | **Google Play Console** production upload | ~4.2 MB |

---

## 2. Signing Keystore Details

The release APK and AAB are cryptographically signed using the project keystore:

* **Keystore Location**: `android/keystores/pteninja-release.jks`
* **Keystore Password**: `pteninja2026`
* **Key Alias**: `pteninja`
* **Key Password**: `pteninja2026`
* **Validity**: 25+ Years (until year 2051)

> **Important**: Keep `android/keystores/pteninja-release.jks` backed up safely. Google Play requires every subsequent app update to be signed with this exact keystore.

---

## 3. How to Build Mobile Updates

Whenever you make frontend changes and want to update the mobile apps:

### Step 1: Rebuild Web Bundle and Sync to Native
```bash
npm run build:mobile
```
This runs `vite build` to compile the web bundle, then runs `cap sync android` to copy the latest HTML/JS/CSS assets into `android/app/src/main/assets/public`.

### Step 2: Build Release APK (For Direct Testing)
```bash
cd android
./gradlew assembleRelease
```
*(On Windows cmd/powershell: `gradlew.bat assembleRelease`)*
Output: `android/app/build/outputs/apk/release/app-release.apk`.

### Step 3: Build Release AAB (For Google Play Store)
```bash
cd android
./gradlew bundleRelease
```
*(On Windows cmd/powershell: `gradlew.bat bundleRelease`)*
Output: `android/app/build/outputs/bundle/release/app-release.aab`.

---

## 4. Google Play Console Upload Checklist

1. Log in to [Google Play Console](https://play.google.com/console).
2. Select your app (**PTE Ninja**).
3. In the left menu, go to **Release → Production** (or **Internal Testing** first).
4. Click **Create new release**.
5. Upload: `release/pteninja-v1.0.0-release.aab`.
6. Add release notes:
   * *Initial release of PTE Ninja: Full PTE Academic practice, AI scoring for Speaking & Writing, Mock Tests, and Personalized Feedback.*
7. Click **Review and rollout**.

---

## 5. iOS App Build Instructions (Mac)

To generate the iOS project and build an IPA for the Apple App Store:

1. Add the iOS platform (one-time command on macOS):
   ```bash
   npx cap add ios
   ```
2. Build and sync web assets:
   ```bash
   npm run build
   npx cap sync ios
   ```
3. Open the project in Xcode:
   ```bash
   npx cap open ios
   ```
4. In Xcode:
   * Select your **Apple Developer Team** under Signing & Capabilities.
   * Connect your iPhone or select **Any iOS Device (arm64)**.
   * Go to **Product → Archive** to generate the App Store release bundle.
