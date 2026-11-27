import { promises as fs } from "node:fs";
import path from "node:path";
import { createMatcher } from "./glob.js";
import { detectLanguage, extractFromSource } from "./extract.js";

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

/**
 * @typedef {object} ScanOptions
 * @property {string[]|null} [include] globs of files to scan (default: all supported)
 * @property {string[]} [exclude] extra globs to skip (dirs and/or files)
 * @property {number} [maxSize] skip files larger than this, in bytes
 */

/**
 * Walk a project and collect every environment-variable read.
 *
 * @param {string} root absolute path
 * @param {ScanOptions} [options]
 */
export async function scanProject(root, options = {}) {
  const include = options.include && options.include.length > 0 ? createMatcher(options.include) : null;
  const exclude = createMatcher([...DEFAULT_IGNORED_FILES, ...(options.exclude ?? [])]);
  const maxSize = options.maxSize ?? 1024 * 1024;

  const usages = [];
  const dynamic = [];
  const languages = new Map();
  const files = [];
  const skipped = { large: 0, binary: 0, unreadable: 0 };

  async function walk(directory, relativeDir) {
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
        await walk(path.join(directory, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (exclude(relativePath, entry.name)) continue;
      if (include && !include(relativePath, entry.name)) continue;

      const language = detectLanguage(entry.name);
      if (!language) continue;

      const absolutePath = path.join(directory, entry.name);
      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch {
        skipped.unreadable += 1;
        continue;
      }
      if (stats.size > maxSize) {
        skipped.large += 1;
        continue;
      }

      let content;
      try {
        content = await fs.readFile(absolutePath, "utf8");
      } catch {
        skipped.unreadable += 1;
        continue;
      }
      if (content.includes("\u0000")) {
        skipped.binary += 1;
        continue;
      }

      const extracted = extractFromSource(content, entry.name);
      if (!extracted) continue;

      files.push(relativePath);
      languages.set(language, (languages.get(language) ?? 0) + 1);
      for (const usage of extracted.usages) {
        usages.push({ ...usage, file: relativePath, lang: extracted.lang });
      }
      for (const item of extracted.dynamic) {
        dynamic.push({ ...item, file: relativePath, lang: extracted.lang });
      }
    }
  }

  await walk(root, "");

  return {
    root,
    filesScanned: files.length,
    files,
    usages,
    dynamic,
    languages: Object.fromEntries(languages),
    skipped,
  };
}
