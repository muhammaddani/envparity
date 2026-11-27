import test from "node:test";
import assert from "node:assert/strict";

import { analyze } from "../src/analyze.js";
import { parseDotenv } from "../src/dotenv.js";

function run({ example, env, ignore } = {}) {
  return analyze({
    usages: [
      { key: "PORT", file: "src/app.js", line: 3, lang: "javascript" },
      { key: "PORT", file: "src/app.js", line: 9, lang: "javascript" },
      { key: "REDIS_URL", file: "src/worker.py", line: 5, lang: "python" },
      { key: "SECRET", file: "src/auth.js", line: 1, lang: "javascript" },
      { key: "SECRET", file: "src/auth.js", line: 4, lang: "javascript" },
    ],
    dynamic: [{ file: "src/app.js", line: 12, text: "process.env[name]" }],
    example: parseDotenv(example ?? "PORT=3000\nOLD_FLAG=false\n"),
    envKeys: env === undefined ? null : env,
    ignore: ignore ?? [],
  });
}

test("reports missing, unused and dynamic findings", () => {
  const result = run();
  assert.deepEqual(result.missing.map((item) => item.key), ["REDIS_URL", "SECRET"]);
  assert.deepEqual(result.unused, [{ key: "OLD_FLAG", line: 2 }]);
  assert.equal(result.summary.used, 3);
  assert.equal(result.summary.documented, 2);
  assert.equal(result.summary.missing, 2);
  assert.equal(result.summary.dynamic, 1);
});

test("groups usages by file with every line number", () => {
  const result = run();
  const secret = result.missing.find((item) => item.key === "SECRET");
  assert.deepEqual(secret.files, [{ file: "src/auth.js", lines: [1, 4] }]);
  assert.deepEqual(secret.usages.map((usage) => usage.line), [1, 4]);
});

test("undeclared is only computed when an env file is supplied", () => {
  assert.deepEqual(run().undeclared, []);
  const result = run({ env: ["PORT"] });
  assert.deepEqual(result.undeclared.map((item) => item.key), ["REDIS_URL", "SECRET"]);
  assert.equal(result.summary.undeclared, 2);
});

test("ignore globs remove keys from every section", () => {
  const result = run({ ignore: ["SECRET", "OLD_*"], env: ["PORT"] });
  assert.deepEqual(result.missing.map((item) => item.key), ["REDIS_URL"]);
  assert.deepEqual(result.unused, []);
  assert.deepEqual(result.undeclared.map((item) => item.key), ["REDIS_URL"]);
  assert.deepEqual(result.ignored, { usages: 2, documented: 1 });
});

test("mentions turn stale documentation into indirect references", () => {
  const result = analyze({
    usages: [{ key: "PORT", file: "src/app.js", line: 1, lang: "javascript" }],
    dynamic: [],
    example: parseDotenv("PORT=3000\nCONFIG_ONLY=1\nSTALE=1\n"),
    mentions: new Map([["CONFIG_ONLY", ["turbo.json", "compose.yml"]]]),
  });
  assert.deepEqual(result.unused.map((item) => item.key), ["STALE"]);
  assert.deepEqual(result.indirect, [{ key: "CONFIG_ONLY", line: 2, files: ["turbo.json", "compose.yml"] }]);
  assert.equal(result.summary.indirect, 1);
  assert.equal(result.summary.unused, 1);
});

test("byArea counts where the findings come from", () => {
  const result = analyze({
    usages: [
      { key: "A", file: "src/a.js", line: 1, lang: "javascript" },
      { key: "B", file: "src/b.test.js", line: 1, lang: "javascript" },
      { key: "C", file: "scripts/deploy.sh", line: 1, lang: "shell" },
    ],
    dynamic: [],
    example: parseDotenv(""),
  });
  assert.deepEqual(result.byArea, { app: 1, tests: 1, scripts: 1, docs: 0 });
});

test("clean projects produce empty findings", () => {
  const result = analyze({
    usages: [{ key: "PORT", file: "app.js", line: 1, lang: "javascript" }],
    dynamic: [],
    example: parseDotenv("PORT=3000\n"),
  });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unused, []);
  assert.deepEqual(result.dynamic, []);
});
