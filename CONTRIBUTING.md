# Contributing

Thanks for taking the time to improve `envparity`.

## Setup

```bash
git clone https://github.com/muhammaddani/envparity.git
cd envparity
npm test
```

There are no runtime or development dependencies. If a change requires a new
dependency, please open an issue first — the zero-dependency constraint is a
feature, not an accident.

## Project layout

```
bin/envparity.js     CLI entry point
src/cli.js          argument parsing, file resolution, exit codes
src/scan.js         directory walking and file filtering
src/extract.js      per-language patterns
src/dotenv.js       .env parsing and appending
src/analyze.js      comparison logic
src/report.js       human and JSON output
src/glob.js         minimal glob matcher
test/               node:test suites
examples/sample-app intentional fixture with known findings
```

## Adding a language

1. Add an entry to `LANGUAGES` in `src/extract.js` with `name`, `test`, `patterns`
   (each pattern's first capture group must be the variable name) and optional
   `dynamic` patterns.
2. Only match names that look like constants: `^[A-Z][A-Z0-9_]*$`.
3. Add cases to `test/extract.test.js`.
4. Update the language table in `README.md`.

## Pull requests

- Keep the diff focused and include tests for behaviour changes.
- Run `npm test` and `npm run self-check` before pushing.
- Explain the user-facing effect in the PR description.

## Reporting bugs

Include the language and snippet that was not detected, plus the output of
`envparity --json` (it contains no secret values).

## Releasing

Releases are produced by `.github/workflows/release.yml` when a `v*` tag is
pushed. Bump `version` in `package.json`, then:

```bash
git tag v0.2.0
git push origin main --tags
```

The workflow runs the tests, verifies that the tag matches `package.json`,
publishes to npm with provenance and opens a GitHub release. Publishing needs an
`NPM_TOKEN` repository secret (a granular npm token with read/write access to
the `envparity` package); without it the publish step is skipped and only the
GitHub release is created.

Finally, move the floating major tag used by the GitHub Action:

```bash
git tag -f v1
git push -f origin v1
```
