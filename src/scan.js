import { promises as fs } from "node:fs";
import path from "node:path";
import { createMatcher } from "./glob.js";
import { detectLanguage, extractFromSource } from "./extract.js";
import { findMentions, findQuotedMentions, isMentionFile } from "./mentions.js";

/** Directories that never contain first-party source worth scanning. */
const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  ".output",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".pytest_cache",
  ".mypy_cache",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  "target",
  "Pods",
  ".gradle",
  ".idea",
]);

/** Files that are generated or too noisy to be useful. */
const DEFAULT_IGNORED_FILES = ["*.min.js", "*.min.mjs", "*.map", "*.lock", "*-lock.json", "package-lock.json"];

/** Translation and data folders: never useful for mention scanning. */
const MENTION_SKIP_DIR = /(^|\/)(locales?|i18n|translations?|messages|lang)(\/)/i;

const READ_CONCURRENCY = 32;

/**
 * @typedef {object} ScanOptions
 * @property {string[]|null} [include] globs of files to scan (default: all supported)
 * @property {string[]} [exclude] extra globs to skip (dirs and/or files)
 * @property {number} [maxSize] skip files larger than this, in bytes
 * @property {string[]} [mentionKeys] keys to look for in config files, docs and templates
 */

/**
 * Walk a project and collect every environment-variable read.
 *
 * When `mentionKeys` is provided, the walk also records which of those keys
 * appear in manifests, compose files, templates or as string literals. That is
 * what allows envparity to tell "stale" apart from "read somewhere we cannot
 * parse".
 *
 * @param {string} root absolute path
 * @param {ScanOptions} [options]
 */
export async function scanProject(root, options = {}) {
  const include = options.include && options.include.length > 0 ? createMatcher(options.include) : null;
  const exclude = createMatcher([...DEFAULT_IGNORED_FILES, ...(options.exclude ?? [])]);
  const maxSize = options.maxSize ?? 1024 * 1024;
  const mentionKeys = new Set(options.mentionKeys ?? []);
  const wantMentions = mentionKeys.size > 0;

  const skipped = { large: 0, binary: 0, unreadable: 0 };
  const candidates = [];

  async function collect(directory, relativeDir) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      skipped.unreadable += 1;
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
        if (exclude(relativePath, entry.name)) continue;
        await collect(path.join(directory, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (exclude(relativePath, entry.name)) continue;

      const language = detectLanguage(entry.name);
      const mention =
        wantMentions && isMentionFile(entry.name) && !MENTION_SKIP_DIR.test(relativePath);
      if (!language && !mention) continue;
      if (include && !include(relativePath, entry.name)) continue;

      candidates.push({
        absolutePath: path.join(directory, entry.name),
        relativePath,
        name: entry.name,
        language,
        mention,
      });
    }
  }

  await collect(root, "");

  async function processFile(candidate) {
    const { absolutePath, relativePath, name, language, mention } = candidate;

    let stats;
    try {
      stats = await fs.stat(absolutePath);
    } catch {
      return { kind: "unreadable" };
    }
    const sizeLimit = mention && !language ? Math.min(maxSize, 512 * 1024) : maxSize;
    if (stats.size > sizeLimit) return { kind: "large" };

    let content;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      return { kind: "unreadable" };
    }
    if (content.includes("\u0000")) return { kind: "binary" };

    const mentionsFound = mention ? findMentions(content, mentionKeys) : [];
    const extracted = language ? extractFromSource(content, name) : null;
    if (language) {
      for (const key of findQuotedMentions(content, mentionKeys)) {
        if (!mentionsFound.includes(key)) mentionsFound.push(key);
      }
    }

    return {
      kind: "file",
      relativePath,
      mention,
      language: extracted?.lang ?? null,
      usages: extracted?.usages ?? [],
      dynamic: extracted?.dynamic ?? [],
      mentions: mentionsFound,
    };
  }

  const results = new Array(candidates.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= candidates.length) return;
      results[index] = await processFile(candidates[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, candidates.length || 1) }, worker));

  const usages = [];
  const dynamic = [];
  const mentions = new Map();
  const languages = new Map();
  const files = [];
  let mentionFiles = 0;

  for (const result of results) {
    if (!result || result.kind !== "file") {
      if (result && result.kind !== "file") skipped[result.kind] += 1;
      continue;
    }
    if (result.mention) mentionFiles += 1;
    for (const key of result.mentions) {
      const list = mentions.get(key) ?? [];
      if (list.length < 3 && !list.includes(result.relativePath)) list.push(result.relativePath);
      mentions.set(key, list);
    }
    if (!result.language) continue;

    files.push(result.relativePath);
    languages.set(result.language, (languages.get(result.language) ?? 0) + 1);
    for (const usage of result.usages) {
      usages.push({ ...usage, file: result.relativePath, lang: result.language });
    }
    for (const item of result.dynamic) {
      dynamic.push({ ...item, file: result.relativePath, lang: result.language });
    }
  }

  return {
    root,
    filesScanned: files.length,
    files,
    usages,
    dynamic,
    mentions,
    mentionFilesScanned: mentionFiles,
    languages: Object.fromEntries(languages),
    skipped,
  };
}
