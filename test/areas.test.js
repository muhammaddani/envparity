import test from "node:test";
import assert from "node:assert/strict";

import { areaOf, countByArea } from "../src/areas.js";

test("areaOf classifies tests", () => {
  assert.equal(areaOf("src/app.test.ts"), "tests");
  assert.equal(areaOf("e2e/login.spec.ts"), "tests");
  assert.equal(areaOf("app/__tests__/a.js"), "tests");
  assert.equal(areaOf("saleor/graphql/shop/tests/test_shop.py"), "tests");
  assert.equal(areaOf("app/services/billing.rb"), "app");
});

test("areaOf classifies docs and scripts", () => {
  assert.equal(areaOf("docs/configuration.md"), "docs");
  assert.equal(areaOf("examples/demo/server.js"), "docs");
  assert.equal(areaOf("scripts/deploy.sh"), "scripts");
  assert.equal(areaOf(".github/workflows/ci.yml"), "scripts");
  assert.equal(areaOf("docker/entrypoint.sh"), "scripts");
});

test("areaOf defaults to app", () => {
  assert.equal(areaOf("src/server.js"), "app");
  assert.equal(areaOf("main.py"), "app");
});

test("countByArea counts locations, not keys", () => {
  const counts = countByArea([
    { key: "A", file: "src/a.js" },
    { key: "A", file: "src/b.js" },
    { key: "B", file: "src/a.test.js" },
    { key: "C", file: "scripts/x.sh" },
  ]);
  assert.deepEqual(counts, { app: 2, tests: 1, scripts: 1, docs: 0 });
});
