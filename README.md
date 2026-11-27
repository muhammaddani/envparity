# envparity

**Keep `.env.example` honest.**

`envparity` scans your source code, finds every environment variable you actually read, and tells you which ones are missing from your example env file — plus the ones you documented but never use.

No config. No dependencies. No network. One command.

[![CI](https://github.com/muhammaddani/envparity/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammaddani/envparity/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## The problem

Every project has a `.env.example`, and it drifts. Somebody adds `STRIPE_WEBHOOK_SECRET`, ships it, and the next person cloning the repo gets a runtime crash instead of a readable list of what to fill in. Meanwhile `OLD_S3_BUCKET` stays in the example for two years after the feature was deleted.

`envparity` compares the two sides and reports the gap:

```
envparity 0.1.0 · scanned 2 files · example examples/sample-app/.env.example

✖ 2 variables used in code but missing from examples/sample-app/.env.example
    REDIS_URL               src/worker.py:5
    SMTP_HOST               src/worker.py:6

⚠ 1 variable documented in examples/sample-app/.env.example but never used in code
    OLD_API_URL             examples/sample-app/.env.example:10

? 1 dynamic access could not be verified
    src/server.js:10  const dynamicValue = process.env[configKey];

6 used · 5 documented · 2 missing · 1 unused

→ Run `envparity --fix` to add 2 missing keys to examples/sample-app/.env.example.
```

## Quick start

```bash
# run once, no install
npx envparity

# or install it in the project
npm install --save-dev envparity

# fail CI when the example file is behind
npx envparity --strict
```

`envparity` auto-detects `.env.example`, `.env.sample`, `.env.template`, `.env.dist`, `.env.defaults`, `env.example`, and `example.env`.

## What it reports

| Section | Meaning |
| --- | --- |
| **missing** | Read in code, absent from the example file. This is the one that breaks fresh clones. |
| **unused** | Present in the example file, never read in code. Stale documentation. |
| **undeclared** | Read in code, absent from a real env file (only with `--env .env`). |
| **dynamic** | `process.env[name]` style access. Listed so you can check it by hand; never invented. |

Values are never read, printed, or transmitted. Only key names and line numbers are used.

## Usage

```
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
      --max-size <bytes>  skip files larger than this (default: 1048576)
      --no-color          disable colored output
  -h, --help              show this help
  -v, --version           print the version
```

### Exit codes

| Code | When |
| --- | --- |
| `0` | No blocking findings (or findings without `--strict`) |
| `1` | Findings were reported and `--strict` was set |
| `2` | Invalid usage, missing directory, or unreadable input |

### `--fix`

Appends `KEY=` lines for missing variables without touching what you already wrote:

```diff
  # Node server
  PORT=3000
  DATABASE_URL=postgres://localhost:5432/app
+
+ # Added by envparity
+ REDIS_URL=
+ SMTP_HOST=
```

Running it twice changes nothing.

### Monorepos

```bash
envparity apps/web --strict
envparity apps/api --example ../../.env.example
envparity . --include "packages/*/src/**" --exclude "**/*.test.js"
```

## GitHub Action

```yaml
name: ci
on: [push, pull_request]

jobs:
  env:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: muhammaddani/envparity@v1
        with:
          path: .
          strict: "true"
```

Inputs: `path`, `example`, `strict` (default `true`), `fix`, `args`.

## Supported languages

| Language | Patterns understood |
| --- | --- |
| JavaScript / TypeScript / JSX / TSX / Vue / Svelte | `process.env.FOO`, `process.env["FOO"]`, `import.meta.env.FOO`, `Deno.env.get("FOO")` |
| Python | `os.environ["FOO"]`, `os.environ.get("FOO")`, `os.getenv("FOO")` |
| Go | `os.Getenv("FOO")`, `os.LookupEnv("FOO")` |
| Rust | `env::var("FOO")`, `env::var_os("FOO")`, `option_env!("FOO")` |
| Ruby | `ENV["FOO"]`, `ENV.fetch("FOO")` |
| PHP | `getenv("FOO")`, `$_ENV["FOO"]` |
| Java / Kotlin / Scala | `System.getenv("FOO")` |
| C# | `Environment.GetEnvironmentVariable("FOO")` |
| Shell / Dockerfile / Compose | `${FOO}`, `${FOO:-default}`, `${FOO:?message}` |

Generated folders (`node_modules`, `dist`, `build`, `coverage`, `.next`, `target`, `vendor`, virtualenvs, …) are skipped automatically.

Variables are only collected when the name looks like a constant (`^[A-Z][A-Z0-9_]*$`), which keeps `process.env[key]` and `config.env.FOO` out of the results.

## Programmatic API

```js
import { readFile } from "node:fs/promises";
import { analyze, parseDotenv, scanProject } from "envparity";

const scan = await scanProject(".");
const example = parseDotenv(await readFile(".env.example", "utf8"));
const report = analyze({
  usages: scan.usages,
  dynamic: scan.dynamic,
  example,
});

console.log(report.missing);
```

## Ignoring variables

Some variables are provided by the platform (`CI`, `AWS_REGION`, `VERCEL_*`) and are not worth documenting:

```bash
envparity --ignore "CI,AWS_*,VERCEL_*"
```

```text
# .envparityignore
CI
AWS_*
VERCEL_*
```

```bash
envparity --ignore-file .envparityignore
```

## How it works

`envparity` is a single pass of pattern matching over text files. It never executes your code, never loads plugins, and never makes a network request. That makes it fast enough for a pre-commit hook and safe enough to run on untrusted repositories.

The trade-off: it does not resolve aliases, re-exports, or configuration indirection. When it cannot see the key, it says so in the **dynamic** section instead of guessing.

Known limits:

- Env access through a helper function (`readEnv("FOO")`) is not detected unless the helper body is in the same repository.
- Reads inside block comments are ignored for C-style languages; string literals that contain `process.env.X` can still produce a false positive.
- Only `UPPER_SNAKE_CASE` keys are collected.

## Development

```bash
npm test          # 44 tests, node:test, zero dependencies
npm run demo      # run against examples/sample-app
npm run self-check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE) © Muhammad Dani Noar
