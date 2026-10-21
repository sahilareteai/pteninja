import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OLD_KEY_PATH = path.join(rootDir, 'old-service-account.json');
const NEW_KEY_PATH = path.join(rootDir, 'new-service-account.json');

async function runMigration() {
  console.log('==================================================');
  console.log('🚀 PTE Ninja Firebase Firestore Migration Tool');
  console.log('==================================================\n');

  if (!fs.existsSync(OLD_KEY_PATH)) {
    console.error(`❌ Missing old service account key: ${OLD_KEY_PATH}`);
    console.error('Please save your old Firebase service account key as "old-service-account.json" in the project root.');
    process.exit(1);
  }

  if (!fs.existsSync(NEW_KEY_PATH)) {
    console.error(`❌ Missing new service account key: ${NEW_KEY_PATH}`);
    console.error('Please save your new Firebase service account key as "new-service-account.json" in the project root.');
    process.exit(1);
  }

  const oldKey = JSON.parse(fs.readFileSync(OLD_KEY_PATH, 'utf8'));
  const newKey = JSON.parse(fs.readFileSync(NEW_KEY_PATH, 'utf8'));

  console.log(`📡 Connecting to Source Project: ${oldKey.project_id}...`);
  const oldApp = initializeApp({ credential: cert(oldKey) }, 'oldApp');
  // Old project used 'pteninja-prod' as the database ID
  const oldDb = getFirestore(oldApp, 'pteninja-prod');

  console.log(`📡 Connecting to Target Project: ${newKey.project_id}...`);
  const newApp = initializeApp({ credential: cert(newKey) }, 'newApp');
  // New project uses default database
  const newDb = getFirestore(newApp);

  console.log('\n🔍 Discovering collections in source database...');
  let collections = await oldDb.listCollections();
  
  // If listCollections returns empty due to permissions or named db quirk, fallback to known collections
  const knownCollections = [
    'users',
    'mock_test_attempts',
    'task_attempts',
    'promoCodes',
    'config',
    'analytics',
    'tasks',
    'guests',
    'support_tickets'
  ];

  const collectionIds = Array.from(new Set([
    ...collections.map(c => c.id),
    ...knownCollections
  ]));

  console.log(`Found ${collectionIds.length} collections to verify/migrate: ${collectionIds.join(', ')}\n`);

  let totalDocsCopied = 0;

  for (const collName of collectionIds) {
    process.stdout.write(`📦 Migrating collection "${collName}"... `);
    const sourceColl = oldDb.collection(collName);
    const snapshot = await sourceColl.get();

    if (snapshot.empty) {
      console.log('0 documents (skipped)');
      continue;
    }

    const docs = snapshot.docs;
    console.log(`${docs.length} documents found.`);

    // Batch writes in chunks of 400 (Firestore limit is 500)
    const BATCH_SIZE = 400;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = newDb.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);

      for (const doc of chunk) {
        const targetRef = newDb.collection(collName).doc(doc.id);
        batch.set(targetRef, doc.data());
      }

      await batch.commit();
      totalDocsCopied += chunk.length;
      process.stdout.write(`   ✓ Wrote batch of ${chunk.length} docs (${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length})\n`);
    }

    // Also check for subcollections within each document in this collection
    for (const doc of docs) {
      const subcollections = await doc.ref.listCollections();
      for (const subColl of subcollections) {
        console.log(`   📂 Found subcollection "${collName}/${doc.id}/${subColl.id}"...`);
        const subSnap = await subColl.get();
        if (subSnap.empty) continue;

        const subDocs = subSnap.docs;
        for (let i = 0; i < subDocs.length; i += BATCH_SIZE) {
          const subBatch = newDb.batch();
          const subChunk = subDocs.slice(i, i + BATCH_SIZE);
          for (const sDoc of subChunk) {
            const targetSubRef = newDb.collection(collName).doc(doc.id).collection(subColl.id).doc(sDoc.id);
            subBatch.set(targetSubRef, sDoc.data());
          }
          await subBatch.commit();
          totalDocsCopied += subChunk.length;
        }
      }
    }
  }

  console.log('\n==================================================');
  console.log(`✅ Firestore Database Migration Complete!`);
  console.log(`Total documents transferred: ${totalDocsCopied}`);
  console.log('==================================================\n');
}

runMigration().catch(err => {
  console.error('\n❌ Migration failed with error:', err);
  process.exit(1);
});
