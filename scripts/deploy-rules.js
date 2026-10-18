import {createHash} from 'node:crypto';
import {readFile, appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const project = 'projects/home-organised';
const releaseName = `${project}/releases/cloud.firestore`;
const endpoint = 'https://firebaserules.googleapis.com/v1/';
export const digest = text => createHash('sha256').update(text).digest('hex');
export function validate(operation, expected) {
  if (!['verify', 'deploy'].includes(operation)) throw Error('Choose verify or deploy.');
  if (operation === 'deploy' && !/^[a-f0-9]{64}$/.test(expected || '')) {
    throw Error('Run verify first, then supply its live rules SHA-256 to deploy.');
  }
}
export async function processRules({operation, expected, token, source, request = fetch}) {
  validate(operation, expected);
  if (!token) throw Error('Google sign-in did not return an access token.');
  async function api(path, method = 'GET', body) {
    const response = await request(endpoint + path, {
      method,
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(30000),
    });
    // Never print request headers or token-bearing objects.
    if (!response.ok) {
      const message = await response.text();
      throw Error(`Firebase Rules API ${method} failed (${response.status}): ${message.replaceAll(token, '[redacted]')}`);
    }
    return response.json();
  }
  const liveRelease = await api(releaseName);
  const validRulesetName = new RegExp(`^${project}/rulesets/[A-Za-z0-9_-]+$`);
  if (!validRulesetName.test(liveRelease.rulesetName || '')) throw Error('Unexpected live ruleset name.');
  const live = await api(liveRelease.rulesetName);
  const files = live.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0].content !== 'string') {
    throw Error('Expected exactly one live rules file; review the live rules manually.');
  }
  const liveHash = digest(files[0].content);
  const desiredHash = digest(source);
  const result = {liveHash, desiredHash, previousRuleset: liveRelease.rulesetName, deployed: false};
  if (operation === 'verify') return result; // Read-only: no POST or PATCH.
  if (expected !== liveHash) throw Error('Live rules changed since verification. Run verify again before deploying.');
  if (liveHash === desiredHash) return {...result, unchanged: true};
  const created = await api(`${project}/rulesets`, 'POST', {
    source: {files: [{name: 'firestore.rules', content: source}]},
  });
  if (!validRulesetName.test(created.name || '')) throw Error('Unexpected new ruleset name.');
  // Check again immediately before switching the release. Google Rules has no
  // compare-and-swap release API; avoid concurrent manual console deployments.
  const latest = await api(releaseName);
  if (latest.rulesetName !== liveRelease.rulesetName) throw Error('Live release changed during deployment; nothing was activated.');
  await api(releaseName, 'PATCH', {
    release: {name: releaseName, rulesetName: created.name},
    updateMask: 'rulesetName',
  });
  return {...result, deployed: true, newRuleset: created.name};
}

async function main() {
  const operation = process.env.OPERATION || 'verify';
  const expected = process.env.EXPECTED_LIVE_SHA256 || '';
  validate(operation, expected);
  if (process.argv.includes('--validate')) return;
  const source = await readFile('firestore.rules', 'utf8');
  const result = await processRules({operation, expected, source, token: process.env.GOOGLE_ACCESS_TOKEN});
  const summary = `## Firebase rules: ${operation}\n\n` +
    `Live rules SHA-256 (use this for a subsequent deploy):\n\n\`${result.liveHash}\`\n\n` +
    `Repository rules SHA-256: \`${result.desiredHash}\`\n\n` +
    `Previous ruleset: \`${result.previousRuleset}\`\n\n` +
    (result.deployed ? `Published ruleset: \`${result.newRuleset}\`.\n` : 'No live rules were changed.\n') +
    '\nThis workflow only calls the Firebase Rules API. It does not read or write household documents.\n';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
