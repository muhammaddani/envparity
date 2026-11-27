import test from "node:test";
import assert from "node:assert/strict";

import { findMentions, findQuotedMentions, isMentionFile } from "../src/mentions.js";

test("isMentionFile accepts manifests, compose files and templates", () => {
  for (const name of [
    "app.json",
    "turbo.json",
    "docker-compose.yml",
    "compose.example.yml",
    "config/app.toml",
    "layout.erb",
    "deploy.tf",
    "application.properties",
    "Dockerfile",
    "Procfile",
  ]) {
    assert.equal(isMentionFile(name), true, name);
  }
});

test("isMentionFile ignores env files, docs, lockfiles and generated output", () => {
  for (const name of [
    ".env",
    ".env.example",
    "production.env",
    "README.md",
    "guide.mdx",
    "package-lock.json",
    "pnpm-lock.yaml",
    "app.min.js",
    "bundle.js.map",
  ]) {
    assert.equal(isMentionFile(name), false, name);
  }
});

test("findMentions only returns wanted keys, without prefix collisions", () => {
  const content = `
    environment:
      DATABASE_URL: postgres://localhost
      AWS_REGION: eu-west-1
    DATABASE_URL_BACKUP: nope
    "STRIPE_SECRET_KEY",
    lowercase_key: nope
  `;
  const wanted = new Set(["DATABASE_URL", "AWS_REGION", "STRIPE_SECRET_KEY", "UNRELATED"]);
  assert.deepEqual(findMentions(content, wanted).sort(), ["AWS_REGION", "DATABASE_URL", "STRIPE_SECRET_KEY"]);
});

test("findMentions returns nothing for an empty wanted set", () => {
  assert.deepEqual(findMentions("DATABASE_URL=1", new Set()), []);
});

test("findQuotedMentions detects keys passed through helper functions", () => {
  const content = [
    'public CDN_URL = this.toOptionalString("CDN_URL");',
    'const key = config.get("STRIPE_SECRET_KEY");',
    'const untouched = "NOT_DOCUMENTED_KEY";',
    '// "COMMENTED_KEY" should be ignored',
    '/* "BLOCK_KEY" should be ignored */',
  ].join("\n");

  const wanted = new Set(["CDN_URL", "STRIPE_SECRET_KEY", "COMMENTED_KEY", "BLOCK_KEY"]);
  assert.deepEqual(findQuotedMentions(content, wanted).sort(), ["CDN_URL", "STRIPE_SECRET_KEY"]);
});

test("findQuotedMentions does not match identifiers or substrings", () => {
  const wanted = new Set(["CDN_URL"]);
  assert.deepEqual(findQuotedMentions('const CDN_URL = 1; const x = "CDN_URL_BACKUP";', wanted), []);
});
