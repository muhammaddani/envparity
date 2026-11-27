import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanProject } from "../src/scan.js";

async function fixture(t, files) {
  const dir = await mkdtemp(path.join(tmpdir(), "envguard-scan-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return dir;
}

test("collects usages from supported files and reports languages", async (t) => {
  const dir = await fixture(t, {
    "src/app.js": "const port = process.env.PORT;\n",
    "src/worker.py": 'redis = os.environ["REDIS_URL"]\n',
    "README.md": "process.env.NOT_SCANNED\n",
  });

  const scan = await scanProject(dir);
  assert.equal(scan.filesScanned, 2);
  assert.deepEqual(scan.usages.map((usage) => usage.key).sort(), ["PORT", "REDIS_URL"]);
  assert.deepEqual(scan.languages, { javascript: 1, python: 1 });
  assert.equal(scan.usages.find((usage) => usage.key === "PORT").file, "src/app.js");
});

test("skips dependency, build and cache directories", async (t) => {
  const dir = await fixture(t, {
    "node_modules/pkg/index.js": "process.env.FROM_NODE_MODULES;\n",
    "dist/bundle.js": "process.env.FROM_DIST;\n",
    ".git/hooks/hook.js": "process.env.FROM_GIT;\n",
    "coverage/report.js": "process.env.FROM_COVERAGE;\n",
    "__pycache__/mod.py": 'os.getenv("FROM_PYCACHE")\n',
    "src/index.js": "process.env.REAL;\n",
  });

  const scan = await scanProject(dir);
  assert.deepEqual(scan.usages.map((usage) => usage.key), ["REAL"]);
  assert.equal(scan.filesScanned, 1);
});

test("respects include and exclude globs", async (t) => {
  const dir = await fixture(t, {
    "src/a.js": "process.env.A;\n",
    "src/a.test.js": "process.env.TEST_ONLY;\n",
    "scripts/tool.js": "process.env.TOOL;\n",
  });

  const scan = await scanProject(dir, { exclude: ["*.test.js"] });
  assert.deepEqual(scan.usages.map((usage) => usage.key).sort(), ["A", "TOOL"]);

  const onlySrc = await scanProject(dir, { include: ["src/**"] });
  assert.deepEqual(onlySrc.usages.map((usage) => usage.key).sort(), ["A", "TEST_ONLY"]);
});

test("skips large and binary files", async (t) => {
  const big = `process.env.BIG;\n${"// padding\n".repeat(50)}`;
  const dir = await fixture(t, {
    "small.js": "process.env.SMALL;\n",
    "big.js": big,
    "binary.js": "process.env.BINARY;\u0000\n",
  });

  const scan = await scanProject(dir, { maxSize: 40 });
  assert.deepEqual(scan.usages.map((usage) => usage.key), ["SMALL"]);
  assert.equal(scan.skipped.large, 1);
  assert.equal(scan.skipped.binary, 1);
});

test("returns an empty result for a project without env usage", async (t) => {
  const dir = await fixture(t, { "src/index.js": "export const answer = 42;\n" });
  const scan = await scanProject(dir);
  assert.equal(scan.filesScanned, 1);
  assert.deepEqual(scan.usages, []);
});
