import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const failures = [];
const read = (path) => readFileSync(path, 'utf8');
const requireText = (path, pattern, message) => {
  if (!pattern.test(read(path))) failures.push(`${path}: ${message}`);
};

for (const path of [
  'package.json',
  'apps/api/package.json',
  'apps/admin/package.json',
  'apps/gallery/package.json',
]) {
  const manifest = JSON.parse(read(path));
  if (manifest.license !== 'AGPL-3.0-only') {
    failures.push(`${path}: license must be AGPL-3.0-only`);
  }
}

requireText('LICENSE', /^\s*GNU AFFERO GENERAL PUBLIC LICENSE/m, 'official AGPL title is missing');
requireText('LICENSE', /13\. Remote Network Interaction;/, 'AGPL network-use section is missing');
requireText('LICENSE', /END OF TERMS AND CONDITIONS/, 'complete AGPL terms are missing');
requireText('NOTICE', /separate commercial licenses/i, 'commercial-license distinction is missing');
requireText('CONTRIBUTING.md', /External contributions are \*\*not accepted\*\*/i, 'contribution freeze is missing');
requireText('CONTRIBUTING.md', /reviewed contributor license agreement \(CLA\)/i, 'reviewed CLA requirement is missing');
requireText('.github/pull_request_template.md', /External pull requests are not accepted/i, 'external PR freeze is missing');

const mitHashes = ['apps/admin/LICENSE', 'apps/gallery/LICENSE'].map((path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex'),
);
const expectedMitHash =
  '0c1b78d27e239a79f2ec5bd8157a8ff02bcf6bfeb460f57246a21e6b2cffc07c';
if (mitHashes.some((hash) => hash !== expectedMitHash)) {
  failures.push('upstream Telegram Mini Apps MIT license text changed');
}

requireText('Dockerfile', /org\.opencontainers\.image\.licenses="AGPL-3\.0-only"/, 'OCI license label is missing');
requireText('Dockerfile', /APP_SOURCE_URL="\$\{BUILD_SOURCE_URL\}"/, 'exact source URL is not embedded');
for (const path of [
  'apps/admin/src/components/SourceNotice.tsx',
  'apps/gallery/src/components/SourceNotice.tsx',
  'apps/gallery/src/components/LandingPage.tsx',
]) {
  requireText(path, /AGPL-3\.0-only/, 'network source/license notice is missing');
}

const workflowPath = '.github/workflows/publish-release.yml';
const workflow = read(workflowPath);
if (!/^\s*workflow_dispatch:\s*$/m.test(workflow)) {
  failures.push(`${workflowPath}: publication must be manually dispatched`);
}
if (/^\s+push:\s*$/m.test(workflow)) {
  failures.push(`${workflowPath}: automatic push trigger is forbidden`);
}
for (const required of [
  'environment: release-publication',
  'ubuntu-24.04-arm',
  'ubuntu-24.04',
  'packages: write',
  'attestations: write',
  'id-token: write',
  'f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
  'PUBLISH GHCR RELEASE',
]) {
  if (!workflow.includes(required)) {
    failures.push(`${workflowPath}: missing required release control: ${required}`);
  }
}
if (/[:@]latest\b/.test(workflow)) {
  failures.push(`${workflowPath}: latest tag is intentionally forbidden`);
}

if (failures.length > 0) {
  console.error(`License/release policy check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('AGPL, contribution, source-offer, and guarded publication policy verified.');
