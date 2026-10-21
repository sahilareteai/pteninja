# PTE Ninja — Database & Authentication Guide

This document outlines the database schema, security rules, authentication providers, and disaster-recovery backup procedures for **PTE Ninja**.

---

## 1. Firebase Project Overview

* **Project Name**: `pteninja-prod`
* **Project ID**: `pteninja-prod`
* **Project Number**: `352036646207`
* **Firestore Database ID**: `(default)`
* **Location**: `nam5` (United States multi-region)

---

## 2. Firestore Collection Schemas

### A. `users` Collection
Stores student profile information, active subscription status, and practice history:
* `id` / Document ID: Firebase Auth UID.
* `email`: Student email address.
* `displayName`: Student full name.
* `plan`: `'free'` | `'premium'` | `'guest'`.
* `subscriptionStatus`: `'active'` | `'trialing'` | `'canceled'` | `'expired'`.
* `subscriptionExpiresAt`: Timestamp when premium access terminates.
* `guestExpiresAt`: 3-day guest trial expiration timestamp.
* `attemptsUsed`: Number of scoring evaluations used today.
* `createdAt` / `updatedAt`: Firestore Server Timestamps.

### B. `mock_test_attempts` Collection
Stores full mock exam submissions and breakdown scores:
* `id` / Document ID: Unique attempt identifier.
* `userId`: Reference to `users/{uid}`.
* `testId`: Test identifier.
* `overallScore`: PTE Academic overall score (10–90 scale).
* `enablingSkills`: Object containing `{ grammar, oralFluency, pronunciation, spelling, vocabulary, writtenDiscourse }`.
* `sectionScores`: Object containing `{ speaking, writing, reading, listening }`.
* `submittedAt`: Timestamp of test submission.

### C. `promoCodes` Collection
Stores promotional discount codes:
* `code`: e.g. `WELCOME50`, `NINJA100`.
* `discountPercent`: e.g. `50`.
* `maxUses`: Maximum redemption count.
* `timesUsed`: Current redemption count.
* `isActive`: Boolean flag.

### D. `analytics` Collection
Tracks daily server-side token usage, API calls, and error counts across Gemini and Vertex AI.

---

## 3. Firestore Security Rules

The active security rules are defined in `firestore.rules`:
1. **User Isolation**: Students can read and write only their own document (`request.auth.uid == userId`).
2. **Subscription Protection**: The `plan`, `subscriptionStatus`, and `subscriptionExpiresAt` fields can only be modified by the backend server via the Firebase Admin SDK (`FIREBASE_SERVICE_ACCOUNT`).
3. **Mock Tests**: Students can create attempts and read their own attempts; updates and deletions are restricted.

To deploy updated rules to Firebase:
```bash
firebase deploy --only firestore:rules --project pteninja-prod
```

---

## 4. Authentication Providers

The following authentication providers are enabled in Firebase Console:
1. **Email / Password**: Standard registration with email verification.
2. **Google OAuth**: One-click Google sign-in.
3. **Anonymous Authentication**: Used for instant 3-day Guest Access.
4. **Phone Authentication**: Mobile SMS OTP login for Android and iOS users.

---

## 5. Automated Backups & Disaster Recovery

### Creating a New Backup
Run the backup script at any time to generate an encrypted snapshot of all Firestore collections:
```bash
npm run migrate:db
```
Outputs: `backups/firestore_backup_YYYY-MM-DD.json`.

To export all Auth user accounts (including password hashes and salt):
```bash
npm run migrate:auth
```
Outputs: `backups/auth_users_backup_YYYY-MM-DD.json`.

### Restoring from Backup
Both migration scripts are idempotent. Running them against a new or restored database will cleanly upsert all records without overwriting newer data.
