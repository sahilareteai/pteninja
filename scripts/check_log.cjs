const { execSync } = require('child_process');
const fs = require('fs');

try {
  const creds = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString();
  const match = creds.match(/password=(.+)/);
  if (!match) throw new Error('No password');
  const token = match[1].trim();

  // Get runs
  const runsJson = execSync(`curl.exe -s -H "Authorization: Bearer ${token}" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/sahilareteai/pteninja/actions/runs?per_page=5"`).toString();
  const runs = JSON.parse(runsJson).workflow_runs;
  console.log('Recent runs:');
  for (const r of runs) {
    console.log(`- ${r.name} (#${r.id}) Status: ${r.status}, Conclusion: ${r.conclusion}`);
  }

  console.log(`\nInspecting job #121444373477...`);
  const log = execSync(`curl.exe -s -L -H "Authorization: Bearer ${token}" "https://api.github.com/repos/sahilareteai/pteninja/actions/jobs/121444373477/logs"`).toString();
  const lines = log.split('\n');
  console.log(lines.slice(-150, -20).join('\n'));
} catch (e) {
  console.error(e.message);
}
