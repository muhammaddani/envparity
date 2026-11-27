import test from "node:test";
import assert from "node:assert/strict";

import { appendKeys, parseDotenv, stringifyDotenv } from "../src/dotenv.js";

test("parses keys, comments, exports and quoted values", () => {
  const parsed = parseDotenv(
    [
      "\uFEFF# leading comment",
      "PORT=3000",
      "export DATABASE_URL='postgres://localhost/db'",
      "",
      "  # indented comment",
      'JWT_SECRET="a=b=c"',
      "EMPTY=",
      "",
    ].join("\n"),
  );

  assert.deepEqual(parsed.keys, ["PORT", "DATABASE_URL", "JWT_SECRET", "EMPTY"]);
  assert.equal(parsed.lineByKey.get("PORT"), 2);
  assert.equal(parsed.lineByKey.get("DATABASE_URL"), 3);
  assert.equal(parsed.entries[0].kind, "comment");
  assert.equal(parsed.entries[3].kind, "blank");
});

test("keeps duplicate keys once, using the first line", () => {
  const parsed = parseDotenv("FOO=1\nFOO=2\n");
  assert.deepEqual(parsed.keys, ["FOO"]);
  assert.equal(parsed.lineByKey.get("FOO"), 1);
});

test("supports dots and dashes in key names", () => {
  const parsed = parseDotenv("app.name=demo\nFEATURE-X=1\n");
  assert.deepEqual(parsed.keys, ["app.name", "FEATURE-X"]);
});

test("round-trips the file byte for byte", () => {
  const content = "# comment\r\nA=1\r\n\r\nB=2\r\n";
  const parsed = parseDotenv(content);
  assert.equal(parsed.eol, "\r\n");
  assert.equal(stringifyDotenv(parsed.entries, parsed.eol), "# comment\r\nA=1\r\n\r\nB=2\r\n");
});

test("appends only missing keys and preserves the existing text", () => {
  const content = "# app\nA=1\nB=2\n";
  const result = appendKeys(content, ["B", "C", "D"]);

  assert.deepEqual(result.added, ["C", "D"]);
  assert.ok(result.content.startsWith(content));
  assert.match(result.content, /# Added by envparity\r?\nC=\r?\nD=\r?\n$/);
  assert.deepEqual(parseDotenv(result.content).keys, ["A", "B", "C", "D"]);
});

test("appendKeys is idempotent", () => {
  const once = appendKeys("A=1\n", ["B"]).content;
  const twice = appendKeys(once, ["B"]);
  assert.deepEqual(twice.added, []);
  assert.equal(twice.content, once);
});

test("appendKeys creates a usable file from nothing", () => {
  const result = appendKeys("", ["A", "B"]);
  assert.deepEqual(result.added, ["A", "B"]);
  assert.deepEqual(parseDotenv(result.content).keys, ["A", "B"]);
});
