import test from "node:test";
import assert from "node:assert/strict";

import { createMatcher, globToRegExp } from "../src/glob.js";

test("globToRegExp: star stays inside one path segment", () => {
  const re = globToRegExp("*.js");
  assert.equal(re.test("app.js"), true);
  assert.equal(re.test("src/app.js"), false);
});

test("globToRegExp: double star crosses path segments", () => {
  assert.equal(globToRegExp("src/**/*.js").test("src/a/b/c.js"), true);
  assert.equal(globToRegExp("src/**/*.js").test("src/c.js"), true);
  assert.equal(globToRegExp("**/*.test.js").test("a/b/c.test.js"), true);
  assert.equal(globToRegExp("examples/**").test("examples/sample-app/src/a.js"), true);
});

test("globToRegExp: question mark matches a single character", () => {
  assert.equal(globToRegExp("file?.js").test("file1.js"), true);
  assert.equal(globToRegExp("file?.js").test("file10.js"), false);
});

test("createMatcher: basename patterns match anywhere", () => {
  const matches = createMatcher(["*.min.js"]);
  assert.equal(matches("dist/app.min.js"), true);
  assert.equal(matches("app.js"), false);
});

test("createMatcher: path patterns match the relative path", () => {
  const matches = createMatcher(["build/**"]);
  assert.equal(matches("build/out/app.js"), true);
  assert.equal(matches("src/app.js"), false);
});

test("createMatcher: key globs work as expected", () => {
  const matches = createMatcher(["AWS_*", "CI"]);
  assert.equal(matches("AWS_REGION"), true);
  assert.equal(matches("CI"), true);
  assert.equal(matches("AWSX_REGION"), false);
  assert.equal(matches("DATABASE_URL"), false);
});

test("createMatcher: normalizes windows separators and leading ./", () => {
  const matches = createMatcher(["./src/**"]);
  assert.equal(matches("src\\nested\\file.js"), true);
});
