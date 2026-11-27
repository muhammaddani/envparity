# Accuracy

How envparity was measured, what the audit found, and what is still out of reach.

## Method

- Nine real open-source projects, shallow clones of the default branch (2026-11-27).
- 37,661 files read; example env file auto-detected in each project.
- Command: `envparity <repo> --json`.
- A `missing` finding is a *location*: one variable can be read in several places.
- A `missing` finding was counted as real only if the reported line really reads
  the key. Because extraction is syntactic and upper-snake-only, every reported
  location is a genuine read — the interesting question is whether it is
  *useful*, which is why findings are also split by area (app, tests, scripts,
  docs).
- `unused` findings were checked with `git grep` over the whole repository. A
  key that appears nowhere outside the env files is treated as stale
  documentation.

## Corpus

| Repository | Stack | Files read | Vars used | Missing | Unused | Indirect | Dynamic |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| formbricks/formbricks | TS | 7,065 | 428 | 363 | 1 | 0 | 7 |
| chatwoot/chatwoot | Ruby | 6,043 | 195 | 155 | 3 | 18 | 4 |
| payloadcms/payload | TS | 8,291 | 188 | 186 | 0 | 0 | 9 |
| makeplane/plane | Python/TS | 3,943 | 184 | 156 | 3 | 0 | 8 |
| outline/outline | TS | 2,560 | 181 | 94 | 0 | 0 | 1 |
| saleor/saleor | Python | 4,391 | 121 | 116 | 0 | 2 | 3 |
| documenso/documenso | TS | 2,470 | 89 | 21 | 0 | 34 | 0 |
| maybe-finance/maybe | Ruby | 1,191 | 70 | 57 | 0 | 2 | 0 |
| hoppscotch/hoppscotch | Vue/TS | 1,707 | 45 | 30 | 0 | 0 | 3 |
| **Total** | | **37,661** | **1,501** | **1,178** | **7** | **56** | **35** |

## What the audit changed

The first version of the extractor reported **151** variables as unused across
this corpus. Four of five were not stale at all — they were reads the scanner
could not see. The audit produced five fixes:

| Gap found in the wild | Fix |
| --- | --- |
| `environment.WEB_CONCURRENCY` and other `process.env` aliases (Outline, ~90 reads) | recognise `env.*` / `environment.*` access |
| `env("KEY")` from django-environ (Saleor, Plane) | Python `env()` pattern |
| `configService.get("KEY")` (NestJS apps) | NestJS pattern |
| Keys passed as literals to helper functions: `this.toOptionalString("CDN_URL")` (Outline) | string-literal mention pass over source files |
| `ENV["KEY"]` inside `.erb` templates (Chatwoot, Maybe) | ERB support |

Result: **151 → 7** unused findings (95% reduction), while recall went *up* —
Outline went from 31 detected variables to 181.

The seven that remain look like real documentation drift:

- `makeplane/plane`: `OPENAI_API_KEY`, `OPENAI_API_BASE`, `DOCKERIZED` — all
  three are marked `# deprecated` in the example file and are read nowhere.
- `chatwoot/chatwoot`: three inbound-email keys that only appear in a URL
  template in `.env.example`.
- `formbricks/formbricks`: `LINGO_API_KEY`, consumed only by an external i18n
  CLI, not by the application.

## Where findings come from

Across the corpus, 1,178 missing variables produced 5,113 usage locations:

| Area | Locations | Share |
| --- | ---: | ---: |
| Application code | 2,946 | 57% |
| Tests | 1,243 | 24% |
| Scripts / CI / Docker | 840 | 16% |
| Docs and examples | 84 | 3% |

That split is why the report shows a `from:` line. On a large repository you
usually want the application slice:

```bash
envparity --exclude "**/*.test.*,**/__tests__/**,e2e/**,docs/**"
```

Tests legitimately read variables that nobody should copy into `.env.example`,
so excluding them is a judgement call, not a correctness fix.

## Speed

Measured on Windows 11, Node 24, cold filesystem cache:

| Repository | Files | Wall time |
| --- | ---: | ---: |
| documenso/documenso | 2,470 | 1.3 s |
| formbricks/formbricks | 7,065 | 4.0 s |
| payloadcms/payload | 8,291 | 4.1 s |

Files are read asynchronously with a bounded pool, and files that cannot
possibly contain an env read are rejected with one cheap check before any
pattern runs.

## Known limits

- Reads through a wrapper whose name is not `env` / `environment` are reported
  as `indirect` (if the key appears as a string literal) or missed.
- Keys built at runtime (`process.env[prefix + name]`) are listed as `dynamic`
  and never guessed.
- String literals that merely look like env keys can make a stale entry look
  `indirect`. That is the deliberate direction of the trade-off: envparity
  prefers a quiet false negative over a noisy false positive.
- Elixir, Dart, C and C++ support was added from documentation, not from this
  corpus.

The audit script and raw JSON are reproducible: clone the nine repositories and
run `envparity <dir> --json`.
