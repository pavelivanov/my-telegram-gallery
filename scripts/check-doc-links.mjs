import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDocuments = [
  'README.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'THIRD_PARTY_NOTICES.md',
];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(target)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
  return files;
}

function markdownLines(source) {
  const lines = source.split(/\r?\n/);
  let fenced = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function anchors(source) {
  const seen = new Map();
  const result = new Set();
  for (const line of markdownLines(source)) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const base = slug(match[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.add(count === 0 ? base : `${base}-${count}`);
  }
  return result;
}

function linkTargets(source) {
  const targets = [];
  const expression = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const line of markdownLines(source)) {
    for (const match of line.matchAll(expression)) {
      let target = match[1].trim();
      if (target.startsWith('<') && target.endsWith('>')) {
        target = target.slice(1, -1);
      } else {
        target = target.split(/\s+["']/)[0];
      }
      targets.push(target);
    }
  }
  return targets;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const documents = [];
for (const relative of rootDocuments) {
  const target = path.join(root, relative);
  if (await exists(target)) documents.push(target);
}
documents.push(...(await markdownFiles(path.join(root, 'docs'))));

const sourceCache = new Map();
const failures = [];
for (const document of documents) {
  const source = await readFile(document, 'utf8');
  sourceCache.set(document, source);
  for (const rawTarget of linkTargets(source)) {
    if (
      !rawTarget ||
      /^(?:https?:|mailto:|tel:)/i.test(rawTarget) ||
      rawTarget.startsWith('//')
    ) {
      continue;
    }
    const [rawPath, rawFragment] = rawTarget.split('#', 2);
    let decodedPath;
    let fragment;
    try {
      decodedPath = decodeURIComponent(rawPath);
      fragment = rawFragment ? decodeURIComponent(rawFragment) : undefined;
    } catch {
      failures.push(`${path.relative(root, document)}: invalid URL encoding in ${rawTarget}`);
      continue;
    }
    let target = decodedPath
      ? path.resolve(path.dirname(document), decodedPath)
      : document;
    if (!(await exists(target))) {
      failures.push(`${path.relative(root, document)}: missing ${rawTarget}`);
      continue;
    }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'README.md');
    if (!(await exists(target))) {
      failures.push(`${path.relative(root, document)}: directory has no README for ${rawTarget}`);
      continue;
    }
    if (fragment) {
      const targetSource =
        sourceCache.get(target) ?? (await readFile(target, 'utf8'));
      sourceCache.set(target, targetSource);
      if (!anchors(targetSource).has(fragment.toLowerCase())) {
        failures.push(`${path.relative(root, document)}: missing anchor ${rawTarget}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.sort().join('\n'));
  process.exitCode = 1;
} else {
  console.info(`Checked ${documents.length} Markdown files.`);
}
