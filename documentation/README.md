# PTE Ninja — Documentation Suite

Welcome to the comprehensive documentation suite for **PTE Ninja**.

---

## 📚 Document Index

| Document | Purpose | File Link |
| :--- | :--- | :--- |
| **Operations Spreadsheet** | Master asset matrix, credentials, providers, quotas & runbooks in CSV | [OPERATIONS_SPREADSHEET.csv](file:///c:/source/repos2/PTENinja/PTENinja/documentation/OPERATIONS_SPREADSHEET.csv) |
| **Operations Guide** | System architecture, daily checklists, rotation runbooks & emergency recovery | [OPERATIONS_GUIDE.md](file:///c:/source/repos2/PTENinja/PTENinja/documentation/OPERATIONS_GUIDE.md) |
| **Deployment Guide** | Vercel setup, custom domain (`pteninja.com`), DNS configuration & env vars | [DEPLOYMENT_GUIDE.md](file:///c:/source/repos2/PTENinja/PTENinja/documentation/DEPLOYMENT_GUIDE.md) |
| **Mobile App Guide** | Capacitor Android/iOS builds, release keystore credentials & Google Play release | [MOBILE_APP_GUIDE.md](file:///c:/source/repos2/PTENinja/PTENinja/documentation/MOBILE_APP_GUIDE.md) |
| **AI Architecture Guide** | 3-tier engine: Groq AI (Free), Gemini (1500 calls/day), Vertex AI ($300 credit) | [AI_ARCHITECTURE_GUIDE.md](file:///c:/source/repos2/PTENinja/PTENinja/documentation/AI_ARCHITECTURE_GUIDE.md) |
| **Database & Auth Guide** | Firestore schemas, security rules, backup commands & authentication providers | [DATABASE_AND_AUTH_GUIDE.md](file:///c:/source/repos2/PTENinja/PTENinja/documentation/DATABASE_AND_AUTH_GUIDE.md) |

---

## 🚀 Quick Commands Cheatsheet

```bash
# Start local development server (Express + Vite)
npm run dev

# Run full test suite (34 automated tests)
npm test

# Type-check TypeScript codebase
npm run lint

# Build production web bundle
npm run build

# Build and sync to native Android app
npm run build:mobile

# Build Android release APK
cd android && ./gradlew assembleRelease

# Build Android App Bundle (AAB) for Google Play
cd android && ./gradlew bundleRelease

# Create fresh database backup
npm run migrate:db

# Create fresh Auth accounts backup
npm run migrate:auth
```
