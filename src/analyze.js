import { createMatcher } from "./glob.js";
import { countByArea } from "./areas.js";

function byKey(a, b) {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Group `{file, line}` pairs into `{file, lines: []}` entries, preserving order. */
function groupByFile(locations) {
  const groups = [];
  for (const location of locations) {
    const last = groups[groups.length - 1];
    if (last && last.file === location.file) last.lines.push(location.line);
    else groups.push({ file: location.file, lines: [location.line] });
  }
  return groups;
}

/**
 * Compare what the code reads against what the env files document.
 *
 * @param {object} input
 * @param {{key: string, file: string, line: number, lang: string}[]} input.usages
 * @param {{file: string, line: number, text: string}[]} input.dynamic
 * @param {{keys: string[], lineByKey: Map<string, number>}} input.example
 * @param {string[]|null} [input.envKeys] keys present in a real env file, if provided
 * @param {string[]} [input.ignore] key globs to ignore
 * @param {Map<string, string[]>} [input.mentions] documented keys seen in config/docs/templates
 */
export function analyze({ usages, dynamic, example, envKeys = null, ignore = [], mentions = new Map() }) {
  const ignored = createMatcher(ignore);
  const ignoredCounts = { usages: 0, documented: 0 };
  const countedUsages = [];

  /** @type {Map<string, {file: string, line: number, lang: string}[]>} */
  const used = new Map();
  for (const usage of usages) {
    if (ignored(usage.key)) {
      ignoredCounts.usages += 1;
      continue;
    }
    countedUsages.push(usage);
    if (!used.has(usage.key)) used.set(usage.key, []);
    used.get(usage.key).push({ file: usage.file, line: usage.line, lang: usage.lang });
  }
  for (const list of used.values()) {
    list.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  }

  const documentedKeys = [];
  for (const key of example.keys) {
    if (ignored(key)) {
      ignoredCounts.documented += 1;
      continue;
    }
    documentedKeys.push(key);
  }
  const documented = new Set(documentedKeys);

  const missing = [...used.entries()]
    .filter(([key]) => !documented.has(key))
    .map(([key, locations]) => ({ key, usages: locations, files: groupByFile(locations) }))
    .sort(byKey);

  const unused = [];
  const indirect = [];
  for (const key of documentedKeys) {
    if (used.has(key)) continue;
    const line = example.lineByKey.get(key) ?? null;
    const seenIn = mentions.get(key) ?? [];
    if (seenIn.length > 0) indirect.push({ key, line, files: seenIn });
    else unused.push({ key, line });
  }
  unused.sort(byKey);
  indirect.sort(byKey);

  let undeclared = [];
  if (envKeys) {
    const declared = new Set(envKeys);
    undeclared = [...used.entries()]
      .filter(([key]) => !declared.has(key))
      .map(([key, locations]) => ({ key, usages: locations, files: groupByFile(locations) }))
      .sort(byKey);
  }

  return {
    missing,
    unused,
    indirect,
    undeclared,
    dynamic,
    ignored: ignoredCounts,
    byArea: countByArea(countedUsages),
    summary: {
      used: used.size,
      documented: documentedKeys.length,
      missing: missing.length,
      unused: unused.length,
      indirect: indirect.length,
      undeclared: undeclared.length,
      dynamic: dynamic.length,
    },
  };
}
