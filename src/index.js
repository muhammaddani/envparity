/**
 * Public programmatic API.
 *
 * @example
 * import { scanProject, analyze, parseDotenv } from "envguard";
 *
 * const scan = await scanProject(process.cwd());
 * const example = parseDotenv(await readFile(".env.example", "utf8"));
 * const result = analyze({ usages: scan.usages, dynamic: scan.dynamic, example });
 */
export { scanProject } from "./scan.js";
export { analyze } from "./analyze.js";
export { detectLanguage, extractFromSource } from "./extract.js";
export { appendKeys, parseDotenv, stringifyDotenv } from "./dotenv.js";
export { createMatcher, globToRegExp } from "./glob.js";
export { formatHuman, formatJson } from "./report.js";
export { main, parseArgv, UsageError } from "./cli.js";
export { version } from "./version.js";
