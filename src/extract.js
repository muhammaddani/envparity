/**
 * Extract environment-variable reads from source code.
 *
 * This is intentionally pattern based: envguard never executes project code,
 * never resolves imports, and never needs a language server. That keeps it
 * instant, safe, and usable on any repository.
 */

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const COMMENT_LINE = /^\s*(?:\/\/|#(?!\{)|<!--|\*|--\s)/;

function stripBlockComments(text) {
  return text.replace(BLOCK_COMMENT, (match) => "\n".repeat((match.match(/\n/g) || []).length));
}

const LANGUAGES = [
  {
    name: "javascript",
    test: (base) => /\.(?:[cm]?[jt]sx?|vue|svelte)$/i.test(base) && !/\.min\.(?:js|mjs)$/i.test(base),
    stripComments: true,
    patterns: [
      /(?<![\w$.])process\.env\.([A-Z][A-Z0-9_]*)/g,
      /(?<![\w$.])process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
      /(?<![\w$.])import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
      /(?<![\w$.])import\.meta\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
      /\bDeno\.env\.get\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]/g,
    ],
    dynamic: [
      /(?<![\w$.])process\.env\s*\[\s*[^\s"'`]/,
      /(?<![\w$.])import\.meta\.env\s*\[\s*[^\s"'`]/,
      /\bDeno\.env\.get\(\s*[^\s"'`)]/,
    ],
  },
  {
    name: "python",
    test: (base) => /\.pyi?$/i.test(base),
    stripComments: false,
    patterns: [
      /os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
      /os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
      /os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    ],
    dynamic: [/os\.environ\[\s*[^\s"']/, /os\.(?:environ\.get|getenv)\(\s*[^\s"')]/],
  },
  {
    name: "go",
    test: (base) => base.endsWith(".go"),
    stripComments: true,
    patterns: [/\bos\.(?:Getenv|LookupEnv)\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g],
    dynamic: [/\bos\.(?:Getenv|LookupEnv)\(\s*[^\s")]/],
  },
  {
    name: "rust",
    test: (base) => base.endsWith(".rs"),
    stripComments: true,
    patterns: [
      /\benv::var(?:_os)?\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g,
      /\boption_env!\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g,
    ],
    dynamic: [/\benv::var(?:_os)?\(\s*[^\s")]/],
  },
  {
    name: "ruby",
    test: (base) => /\.(?:rb|rake)$/i.test(base),
    stripComments: false,
    patterns: [
      /\bENV\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
      /\bENV\.fetch\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
    ],
    dynamic: [/\bENV\[\s*[^\s"']/, /\bENV\.fetch\(\s*[^\s"')]/],
  },
  {
    name: "php",
    test: (base) => base.endsWith(".php"),
    stripComments: true,
    patterns: [
      /\bgetenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
      /\$_ENV\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
    ],
    dynamic: [/\bgetenv\(\s*[^\s"')]/, /\$_ENV\[\s*[^\s"']/],
  },
  {
    name: "jvm",
    test: (base) => /\.(?:java|kt|kts|scala)$/i.test(base),
    stripComments: true,
    patterns: [/System\.getenv\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g],
    dynamic: [/System\.getenv\(\s*[^\s")]/],
  },
  {
    name: "csharp",
    test: (base) => base.endsWith(".cs"),
    stripComments: true,
    patterns: [/Environment\.GetEnvironmentVariable\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g],
    dynamic: [/Environment\.GetEnvironmentVariable\(\s*[^\s")]/],
  },
  {
    name: "shell",
    test: (base) => /\.(?:sh|bash|zsh|ksh)$/i.test(base),
    stripComments: false,
    patterns: [/\$\{([A-Z][A-Z0-9_]*)(?::?[-=?+][^{}]*)?\}/g],
    dynamic: [],
  },
  {
    name: "dockerfile",
    test: (base) => /^(?:Dockerfile(?:\..+)?|.*\.dockerfile)$/i.test(base),
    stripComments: false,
    patterns: [/\$\{([A-Z][A-Z0-9_]*)(?::?[-=?+][^{}]*)?\}/g],
    dynamic: [],
  },
  {
    name: "compose",
    test: (base) => /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/i.test(base),
    stripComments: false,
    patterns: [/\$\{([A-Z][A-Z0-9_]*)(?::?[-=?+][^{}]*)?\}/g],
    dynamic: [],
  },
];

/**
 * @param {string} basename
 * @returns {string|null} language name
 */
export function detectLanguage(basename) {
  const language = LANGUAGES.find((candidate) => candidate.test(basename));
  return language ? language.name : null;
}

/**
 * @param {string} content
 * @param {string} filename basename or path; only the basename is inspected
 * @returns {{lang: string, usages: {key: string, line: number}[], dynamic: {line: number, text: string}[]} | null}
 */
export function extractFromSource(content, filename) {
  const basename = filename.split(/[\\/]/).pop();
  const language = LANGUAGES.find((candidate) => candidate.test(basename));
  if (!language) return null;

  const text = language.stripComments ? stripBlockComments(content) : content;
  const lines = text.split(/\r?\n/);
  const usages = [];
  const dynamic = [];
  const seen = new Set();

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (COMMENT_LINE.test(line)) continue;

    for (const pattern of language.patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        if (match[0] === "") {
          pattern.lastIndex += 1;
          continue;
        }
        const key = match[1];
        const marker = `${key}:${index + 1}`;
        if (seen.has(marker)) continue;
        seen.add(marker);
        usages.push({ key, line: index + 1 });
      }
    }

    for (const pattern of language.dynamic) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        dynamic.push({ line: index + 1, text: line.trim().slice(0, 160) });
        break;
      }
    }
  }

  return { lang: language.name, usages, dynamic };
}
