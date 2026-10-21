import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const OLD_KEY_PATH = path.join(rootDir, 'old-service-account.json');
const NEW_KEY_PATH = path.join(rootDir, 'new-service-account.json');
const BACKUP_AUTH_FILE = path.join(rootDir, 'auth-users-backup.json');

async function runAuthMigration() {
  console.log('==================================================');
  console.log('🔑 PTE Ninja Firebase Authentication Migration Tool');
  console.log('==================================================\n');

  if (!fs.existsSync(OLD_KEY_PATH) || !fs.existsSync(NEW_KEY_PATH)) {
    console.error('❌ Missing service account keys.');
    process.exit(1);
  }

  const oldKey = JSON.parse(fs.readFileSync(OLD_KEY_PATH, 'utf8'));
  const newKey = JSON.parse(fs.readFileSync(NEW_KEY_PATH, 'utf8'));

  console.log(`📥 Step 1: Exporting auth accounts from source project: ${oldKey.project_id}...`);
  try {
    execSync(`cmd /c "npx firebase-tools auth:export \\"${BACKUP_AUTH_FILE}\\" --project ${oldKey.project_id} --format=json"`, {
      cwd: rootDir,
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: OLD_KEY_PATH },
      stdio: 'inherit',
      shell: true
    });
  } catch (err) {
    console.error('Failed to export auth users:', err.message);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_AUTH_FILE)) {
    console.error('❌ Auth export file was not created.');
    process.exit(1);
  }

  const authData = JSON.parse(fs.readFileSync(BACKUP_AUTH_FILE, 'utf8'));
  const users = authData.users || [];
  console.log(`\nFound ${users.length} user accounts to migrate.`);

  if (users.length === 0) {
    console.log('No users to import. Complete!');
    return;
  }

  console.log(`\n📤 Step 2: Importing auth accounts into target project: ${newKey.project_id}...`);
  // If hash parameters are present in the export, supply them
  let hashFlags = '';
  if (authData.hash_config) {
    const hc = authData.hash_config;
    if (hc.algorithm === 'SCRYPT') {
      hashFlags = `--hash-algo=SCRYPT --rounds=${hc.rounds || 8} --mem-cost=${hc.mem_cost || 14}`;
      if (hc.signer_key) hashFlags += ` --hash-key="${hc.signer_key}"`;
      if (hc.salt_separator) hashFlags += ` --salt-separator="${hc.salt_separator}"`;
    }
  }

  try {
    execSync(`cmd /c "npx firebase-tools auth:import \\"${BACKUP_AUTH_FILE}\\" --project ${newKey.project_id} ${hashFlags}"`, {
      cwd: rootDir,
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: NEW_KEY_PATH },
      stdio: 'inherit',
      shell: true
    });
    console.log('\n✅ User authentication migration complete! All passwords and UIDs preserved.');
  } catch (err) {
    console.error('Failed to import auth users:', err.message);
    process.exit(1);
  }
}

runAuthMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
