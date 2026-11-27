import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { version } from "../src/version.js";

const BIN = fileURLToPath(new URL("../bin/envguard.js", import.meta.url));

async function fixture(t, files) {
  const dir = await mkdtemp(path.join(tmpdir(), "envguard-cli-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return dir;
}

function cli(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      { cwd, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "" }, timeout: 20_000 },
      (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === "number" ? error.code : 2) : 0, stdout, stderr });
      },
    );
  });
}

const PROJECT = {
  ".env.example": "# documented\nPORT=3000\nOLD_FLAG=false\n",
  "src/app.js": "const port = process.env.PORT;\nconst theme = process.env.THEME;\n",
  "src/worker.py": 'redis = os.environ["REDIS_URL"]\n',
};

test("prints a human report and exits 0 without --strict", async (t) => {
  const dir = await fixture(t, PROJECT);
  const { code, stdout } = await cli([], dir);

  assert.equal(code, 0);
  assert.match(stdout, /used in code but missing/);
  assert.match(stdout, /THEME/);
  assert.match(stdout, /REDIS_URL/);
  assert.match(stdout, /OLD_FLAG/);
  assert.match(stdout, /never used in code/);
  assert.match(stdout, /envguard --fix/);
});

test("--strict exits 1 when variables are missing", async (t) => {
  const dir = await fixture(t, PROJECT);
  const { code } = await cli(["--strict"], dir);
  assert.equal(code, 1);
});

test("--strict exits 0 when everything is documented", async (t) => {
  const dir = await fixture(t, {
    ".env.example": "PORT=3000\nTHEME=dark\nREDIS_URL=redis://localhost\n",
    "src/app.js": "process.env.PORT; process.env.THEME;\n",
    "src/worker.py": 'os.environ["REDIS_URL"]\n',
  });
  const { code, stdout } = await cli(["--strict"], dir);
  assert.equal(code, 0);
  assert.match(stdout, /All 3 variables used in code are documented/);
});

test("--fix appends missing keys and is idempotent", async (t) => {
  const dir = await fixture(t, PROJECT);
  const first = await cli(["--fix"], dir);
  assert.equal(first.code, 0);
  assert.match(first.stdout, /Added 2 keys/);

  const content = await readFile(path.join(dir, ".env.example"), "utf8");
  assert.match(content, /^PORT=3000$/m);
  assert.match(content, /^THEME=$/m);
  assert.match(content, /^REDIS_URL=$/m);

  const second = await cli(["--fix"], dir);
  assert.equal(second.code, 0);
  assert.doesNotMatch(second.stdout, /Added/);
});

test("--fix creates .env.example when none exists", async (t) => {
  const dir = await fixture(t, { "src/app.js": "process.env.TOKEN;\n" });
  const { code } = await cli(["--fix"], dir);
  assert.equal(code, 0);
  assert.match(await readFile(path.join(dir, ".env.example"), "utf8"), /^TOKEN=$/m);
});

test("exits 2 when no example file exists and --fix was not passed", async (t) => {
  const dir = await fixture(t, { "src/app.js": "process.env.TOKEN;\n" });
  const { code, stderr } = await cli([], dir);
  assert.equal(code, 2);
  assert.match(stderr, /no example env file found/);
});

test("--json emits a machine-readable report", async (t) => {
  const dir = await fixture(t, PROJECT);
  const { code, stdout } = await cli(["--json"], dir);
  assert.equal(code, 0);

  const report = JSON.parse(stdout);
  assert.equal(report.version, version);
  assert.equal(report.scannedFiles, 2);
  assert.deepEqual(
    report.missing.map((item) => item.key),
    ["REDIS_URL", "THEME"],
  );
  assert.deepEqual(report.unused, [{ key: "OLD_FLAG", line: 3 }]);
  assert.equal(report.summary.missing, 2);
  assert.ok(Array.isArray(report.missing[0].usages));
});

test("--env reports variables that are not set", async (t) => {
  const dir = await fixture(t, { ...PROJECT, ".env": "PORT=3000\nTHEME=dark\n" });
  const { stdout } = await cli(["--env", ".env", "--json"], dir);
  const report = JSON.parse(stdout);
  assert.deepEqual(report.undeclared.map((item) => item.key), ["REDIS_URL"]);
});

test("--ignore and --ignore-file suppress keys", async (t) => {
  const dir = await fixture(t, { ...PROJECT, "ignore.txt": "# keys\nREDIS_*\n" });
  const { stdout } = await cli(["--json", "--ignore", "THEME", "--ignore-file", "ignore.txt"], dir);
  const report = JSON.parse(stdout);
  assert.deepEqual(report.missing, []);
});

test("--include limits the scanned files", async (t) => {
  const dir = await fixture(t, PROJECT);
  const { stdout } = await cli(["--json", "--include", "src/worker.py"], dir);
  const report = JSON.parse(stdout);
  assert.deepEqual(
    report.missing.map((item) => item.key),
    ["REDIS_URL"],
  );
});

test("--help and --version exit 0", async (t) => {
  const dir = await fixture(t, PROJECT);
  const help = await cli(["--help"], dir);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage/);

  const versionOutput = await cli(["--version"], dir);
  assert.equal(versionOutput.code, 0);
  assert.match(versionOutput.stdout, new RegExp(`^${version.replace(/\./g, "\\.")}`));
});

test("invalid usage exits 2 with a helpful message", async (t) => {
  const dir = await fixture(t, PROJECT);
  const unknown = await cli(["--nope"], dir);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /unknown option: --nope/);

  const missingValue = await cli(["--example"], dir);
  assert.equal(missingValue.code, 2);
  assert.match(missingValue.stderr, /requires a value/);

  const notADirectory = await cli(["does-not-exist"], dir);
  assert.equal(notADirectory.code, 2);
});
