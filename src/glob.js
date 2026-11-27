/**
 * Minimal glob matcher (zero dependencies).
 *
 * Supports:
 *   *      any characters except "/"
 *   **      any characters, including "/"
 *   ** /    zero or more leading path segments (no space in practice)
 *   ?      a single character except "/"
 *
 * A pattern without a "/" is matched against the file's basename as well as
 * its relative path, so `--exclude "*.test.js"` behaves like people expect.
 */

const SPECIAL = /[\\^$.|+()[\]{}]/;

export function globToRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        const slash = pattern[i + 2] === "/";
        i += slash ? 2 : 1;
        source += slash ? "(?:.*/)?" : ".*";
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += SPECIAL.test(char) ? `\\${char}` : char;
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Build a predicate from a list of glob patterns.
 * @param {string[]|null|undefined} patterns
 * @returns {(relativePath: string, basename?: string) => boolean}
 */
export function createMatcher(patterns) {
  if (!patterns || patterns.length === 0) return () => false;
  const rules = patterns.map((pattern) => {
    const normalized = String(pattern).replace(/\\/g, "/").replace(/^\.\//, "").trim();
    return { testBasename: !normalized.includes("/"), re: globToRegExp(normalized) };
  });
  return (relativePath, basename) => {
    const posixPath = relativePath.replace(/\\/g, "/");
    const name = basename ?? posixPath.split("/").pop();
    return rules.some((rule) => rule.re.test(posixPath) || (rule.testBasename && rule.re.test(name)));
  };
}
