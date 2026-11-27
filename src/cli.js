import path from "node:path";
import { promises as fs } from "node:fs";

import { analyze } from "./analyze.js";
import { appendKeys, parseDotenv } from "./dotenv.js";
import { formatHuman, formatJson } from "./report.js";
import { scanProject } from "./scan.js";
import { version } from "./version.js";

const EXAMPLE_CANDIDATES = [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.dist",
  ".env.defaults",
  "env.example",
  "example.env",
];

const DEFAULT_MAX_SIZE = 1024 * 1024;

export const HELP = `envparity ${version} — keep .env.example honest

Usage
  envparity [path] [options]

Options
  -e, --example <file>    example env file to check against
                          (default: auto-detect .env.example, .env.sample, ...)
      --env <file>        also verify keys exist in a real env file (e.g. .env)
      --fix               append missing keys to the example file
      --strict            exit 1 when variables are missing or undeclared
      --json              print a machine-readable report
      --ignore <list>     comma-separated key globs to ignore (e.g. CI,AWS_*)
      --ignore-file <f>   read ignored keys/globs from a file (one per line)
      --include <list>    comma-separated globs of files to scan
      --exclude <list>    comma-separated globs of files or folders to skip
      --max-size <bytes>  skip files larger than this (default: ${DEFAULT_MAX_SIZE})
      --no-color          disable colored output
  -h, --help              show this help
  -v, --version           print the version

Exit codes
  0  no blocking problems (or findings without --strict)
  1  findings were reported and --strict was set
  2  invalid usage or unreadable input

Examples
  envparity
  envparity apps/web --strict
  envparity --fix
  envparity --json --ignore "AWS_*,CI"
`;

export class UsageError extends Error {}

function parseList(value) {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  const opts = {
    path: null,
    example: null,
    env: null,
    fix: false,
    strict: false,
    json: false,
    ignore: [],
    ignoreFile: null,
    include: null,
    exclude: [],
    maxSize: DEFAULT_MAX_SIZE,
    color: true,
    help: false,
    version: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index++) {
    let arg = argv[index];
    if (arg === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positional.push(arg);
      continue;
    }

    let inlineValue = null;
    if (arg.startsWith("--")) {
      const equals = arg.indexOf("=");
      if (equals !== -1) {
        inlineValue = arg.slice(equals + 1);
        arg = arg.slice(0, equals);
      }
    }

    const takeValue = () => {
      if (inlineValue !== null) return inlineValue;
      const next = argv[++index];
      if (next === undefined) throw new UsageError(`option ${arg} requires a value`);
      return next;
    };

    switch (arg) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      case "--fix":
        opts.fix = true;
        break;
      case "--strict":
        opts.strict = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--no-color":
        opts.color = false;
        break;
      case "--color":
        opts.color = true;
        break;
      case "-e":
      case "--example":
        opts.example = takeValue();
        break;
      case "--env":
        opts.env = takeValue();
        break;
      case "--ignore":
        opts.ignore.push(...parseList(takeValue()));
        break;
      case "--ignore-file":
        opts.ignoreFile = takeValue();
        break;
      case "--include":
        opts.include = parseList(takeValue());
        break;
      case "--exclude":
        opts.exclude.push(...parseList(takeValue()));
        break;
      case "--max-size": {
        const raw = takeValue();
        const size = Number(raw);
        if (!Number.isInteger(size) || size <= 0) {
          throw new UsageError(`--max-size expects a positive integer, got: ${raw}`);
        }
        opts.maxSize = size;
        break;
      }
      default:
        throw new UsageError(`unknown option: ${arg}`);
    }
  }

  if (positional.length > 1) {
    throw new UsageError(`expected at most one path, got: ${positional.join(" ")}`);
  }
  if (positional.length === 1) opts.path = positional[0];

  return opts;
}

async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

function displayPath(absolutePath) {
  const relative = path.relative(process.cwd(), absolutePath);
  if (!relative) return ".";
  return relative.split(path.sep).join("/");
}

async function readIgnoreFile(file) {
  const content = await fs.readFile(file, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

async function findExampleFile(root, requested) {
  if (requested) {
    const fromCwd = path.resolve(requested);
    if (await statOrNull(fromCwd)) return fromCwd;
    const fromRoot = path.resolve(root, requested);
    if (await statOrNull(fromRoot)) return fromRoot;
    return fromCwd;
  }
  for (const candidate of EXAMPLE_CANDIDATES) {
    const absolute = path.join(root, candidate);
    if (await statOrNull(absolute)) return absolute;
  }
  return path.join(root, ".env.example");
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  let opts;
  try {
    opts = parseArgv(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`envparity: ${error.message}\n\n${HELP}`);
      return 2;
    }
    throw error;
  }

  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  const root = path.resolve(opts.path ?? ".");
  const rootStats = await statOrNull(root);
  if (!rootStats || !rootStats.isDirectory()) {
    process.stderr.write(`envparity: not a directory: ${opts.path ?? "."}\n`);
    return 2;
  }

  const examplePath = await findExampleFile(root, opts.example);
  const exampleExists = Boolean(await statOrNull(examplePath));
  if (!exampleExists && !opts.fix) {
    if (opts.example) {
      process.stderr.write(`envparity: example file not found: ${opts.example}\n`);
      return 2;
    }
    process.stderr.write(
      [
        `envparity: no example env file found in ${displayPath(root)}`,
        `  Looked for: ${EXAMPLE_CANDIDATES.join(", ")}`,
        "  Create one, pass --example <file>, or run `envparity --fix` to generate .env.example.",
        "",
      ].join("\n"),
    );
    return 2;
  }

  let envPath = null;
  if (opts.env) {
    envPath = path.resolve(opts.env);
    if (!(await statOrNull(envPath))) {
      const fromRoot = path.resolve(root, opts.env);
      if (await statOrNull(fromRoot)) envPath = fromRoot;
      else {
        process.stderr.write(`envparity: env file not found: ${opts.env}\n`);
        return 2;
      }
    }
  }

  const ignore = [...opts.ignore];
  if (opts.ignoreFile) {
    try {
      ignore.push(...(await readIgnoreFile(path.resolve(opts.ignoreFile))));
    } catch {
      process.stderr.write(`envparity: cannot read ignore file: ${opts.ignoreFile}\n`);
      return 2;
    }
  }

  let exampleContent = "";
  let envKeys = null;
  try {
    if (exampleExists) exampleContent = await fs.readFile(examplePath, "utf8");
    if (envPath) envKeys = parseDotenv(await fs.readFile(envPath, "utf8")).keys;
  } catch (error) {
    process.stderr.write(`envparity: cannot read ${error.path ?? "input file"}: ${error.message}\n`);
    return 2;
  }

  const scan = await scanProject(root, {
    include: opts.include,
    exclude: opts.exclude,
    maxSize: opts.maxSize,
  });

  let example = parseDotenv(exampleContent);
  let analysis = analyze({
    usages: scan.usages,
    dynamic: scan.dynamic,
    example,
    envKeys,
    ignore,
  });

  let added = [];
  if (opts.fix) {
    const result = appendKeys(exampleContent, analysis.missing.map((item) => item.key));
    added = result.added;
    if (added.length > 0) {
      try {
        await fs.mkdir(path.dirname(examplePath), { recursive: true });
        await fs.writeFile(examplePath, result.content);
      } catch (error) {
        process.stderr.write(`envparity: cannot write ${displayPath(examplePath)}: ${error.message}\n`);
        return 2;
      }
      exampleContent = result.content;
      example = parseDotenv(exampleContent);
      analysis = analyze({
        usages: scan.usages,
        dynamic: scan.dynamic,
        example,
        envKeys,
        ignore,
      });
    }
  }

  const report = {
    version,
    root,
    exampleFile: displayPath(examplePath),
    envFile: envPath ? displayPath(envPath) : null,
    scannedFiles: scan.filesScanned,
    languages: scan.languages,
    ...analysis,
    added,
    fixed: opts.fix,
  };

  const color = opts.color && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  process.stdout.write(opts.json ? formatJson(report) : formatHuman(report, { color }));

  const failures = analysis.summary.missing + analysis.summary.undeclared;
  if (opts.strict && failures > 0) return 1;
  return 0;
}
