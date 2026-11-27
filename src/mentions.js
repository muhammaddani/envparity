/**
 * Some documented variables are never read directly from source code, but are
 * still referenced elsewhere: docker-compose `environment:` blocks, turbo.json,
 * app.json (Heroku), Kubernetes manifests, ERB/Handlebars templates, docs.
 *
 * Reading those files lets envparity distinguish "stale documentation" from
 * "consumed outside the parsed source", which is the difference between a
 * useful warning and noise.
 */

const MENTION_EXTENSIONS = new Set([
  ".json",
  ".jsonc",
  ".json5",
  ".yml",
  ".yaml",
  ".toml",
  ".erb",
  ".ejs",
  ".hbs",
  ".handlebars",
  ".twig",
  ".tf",
  ".tfvars",
  ".ini",
  ".conf",
  ".cfg",
  ".xml",
  ".properties",
  ".plist",
  ".service",
  ".template",
]);

const MENTION_NAMES = new Set(["Dockerfile", "Procfile", "Justfile", "Makefile"]);

/** Generated files that only add noise. */
const NOT_MENTION = /(?:^|\.)(?:min|map|lock)$|^(?:package-lock|pnpm-lock|yarn)\./i;

/** JSON files worth reading: manifests and tool config, not data or translations. */
const MENTION_JSON =
  /^(?:app|package|turbo|now|vercel|render|fly|project|heroku|compose|docker-compose)(?:\.[\w-]+)?\.json$|\.config\.json$/i;

/**
 * @param {string} basename
 * @returns {boolean}
 */
export function isMentionFile(basename) {
  if (/^\.env/.test(basename) || /\.env$/i.test(basename)) return false;
  if (NOT_MENTION.test(basename)) return false;
  if (MENTION_NAMES.has(basename)) return true;
  const dot = basename.lastIndexOf(".");
  if (dot === -1) return false;
  const extension = basename.slice(dot).toLowerCase();
  if (extension === ".json") return MENTION_JSON.test(basename);
  return MENTION_EXTENSIONS.has(extension);
}

const TOKEN = /(?<![A-Za-z0-9_])[A-Z][A-Z0-9_]{2,}(?![A-Za-z0-9_])/g;
const QUOTED = /["'`]([A-Z][A-Z0-9_]{2,})["'`]/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const COMMENT_LINE = /^\s*(?:\/\/|#(?!\{)|\*|<!--|--\s)/;

/**
 * Record which keys appear in a file. Returns the keys that matched.
 * @param {string} content
 * @param {Set<string>} wanted
 * @returns {string[]}
 */
export function findMentions(content, wanted) {
  const found = new Set();
  if (wanted.size === 0) return [];
  TOKEN.lastIndex = 0;
  let match;
  while ((match = TOKEN.exec(content)) !== null) {
    const token = match[0];
    if (wanted.has(token) && !found.has(token)) found.add(token);
  }
  return [...found];
}

/**
 * Find documented keys that appear as string literals in source code.
 *
 * This is how envparity understands projects that read the environment through
 * a helper (`this.toOptionalString("AWS_CLOUDFRONT_URL")`, `config.get("X")`,
 * `env("X")`) instead of a language-level API.
 *
 * @param {string} content
 * @param {Set<string>} wanted
 * @returns {string[]}
 */
export function findQuotedMentions(content, wanted) {
  if (wanted.size === 0) return [];
  const found = new Set();
  const text = content.replace(BLOCK_COMMENT, (match) => "\n".repeat((match.match(/\n/g) || []).length));
  for (const line of text.split(/\r?\n/)) {
    if (COMMENT_LINE.test(line)) continue;
    QUOTED.lastIndex = 0;
    let match;
    while ((match = QUOTED.exec(line)) !== null) {
      if (wanted.has(match[1])) found.add(match[1]);
    }
  }
  return [...found];
}
