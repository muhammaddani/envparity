/**
 * A small, dependency-free .env parser that keeps the original file structure
 * so that `--fix` can append keys without rewriting what the user wrote.
 */

const KEY_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=/;

/**
 * @param {string} content
 * @returns {{
 *   eol: string,
 *   entries: {kind: "blank"|"comment"|"pair"|"other", raw: string, line: number, key?: string}[],
 *   keys: string[],
 *   lineByKey: Map<string, number>
 * }}
 */
export function parseDotenv(content) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const text = content.replace(/^\uFEFF/, "");
  const rawLines = text.split(/\r?\n/);

  const entries = rawLines.map((raw, index) => {
    const trimmed = raw.trim();
    const line = index + 1;
    if (trimmed === "") return { kind: "blank", raw, line };
    if (trimmed.startsWith("#")) return { kind: "comment", raw, line };
    const match = KEY_RE.exec(raw);
    if (match) return { kind: "pair", raw, line, key: match[1] };
    return { kind: "other", raw, line };
  });

  const keys = [];
  const lineByKey = new Map();
  for (const entry of entries) {
    if (entry.kind !== "pair") continue;
    if (!lineByKey.has(entry.key)) lineByKey.set(entry.key, entry.line);
    if (!keys.includes(entry.key)) keys.push(entry.key);
  }

  return { eol, entries, keys, lineByKey };
}

/**
 * Serialize parsed entries back to text.
 * @param {{raw: string}[]} entries
 * @param {string} eol
 */
export function stringifyDotenv(entries, eol = "\n") {
  return entries.map((entry) => entry.raw).join(eol);
}

/**
 * Append `KEY=` lines for keys that are not documented yet.
 * The existing file is preserved byte-for-byte apart from the appended block.
 *
 * @param {string} content
 * @param {string[]} keys
 * @param {{header?: string}} [options]
 * @returns {{content: string, added: string[]}}
 */
export function appendKeys(content, keys, options = {}) {
  const header = options.header ?? "# Added by envparity";
  const { eol, keys: existing } = parseDotenv(content);
  const have = new Set(existing);
  const toAdd = [];
  for (const key of keys) {
    if (have.has(key) || toAdd.includes(key)) continue;
    toAdd.push(key);
  }
  if (toAdd.length === 0) return { content, added: [] };

  let output = content;
  if (output.length > 0 && !/\r?\n$/.test(output)) output += eol;
  if (output.length > 0) output += eol;
  output += `${header}${eol}`;
  for (const key of toAdd) output += `${key}=${eol}`;

  return { content: output, added: toAdd };
}
