import test from "node:test";
import assert from "node:assert/strict";

import { detectLanguage, extractFromSource } from "../src/extract.js";

function keys(source, filename) {
  const result = extractFromSource(source, filename);
  return result.usages.map((usage) => usage.key);
}

test("detects languages from the file name", () => {
  assert.equal(detectLanguage("server.js"), "javascript");
  assert.equal(detectLanguage("App.tsx"), "javascript");
  assert.equal(detectLanguage("worker.py"), "python");
  assert.equal(detectLanguage("main.go"), "go");
  assert.equal(detectLanguage("lib.rs"), "rust");
  assert.equal(detectLanguage("deploy.sh"), "shell");
  assert.equal(detectLanguage("Dockerfile"), "dockerfile");
  assert.equal(detectLanguage("docker-compose.yml"), "compose");
  assert.equal(detectLanguage("README.md"), null);
});

test("javascript: dot, bracket, import.meta and Deno access", () => {
  const source = [
    "const a = process.env.PORT;",
    'const b = process.env["DATABASE_URL"];',
    "const c = process.env['JWT_SECRET'];",
    "const d = import.meta.env.VITE_API_URL;",
    'const e = import.meta.env["VITE_FLAG"];',
    'const f = Deno.env.get("DENO_TOKEN");',
  ].join("\n");

  assert.deepEqual(keys(source, "app.js"), [
    "PORT",
    "DATABASE_URL",
    "JWT_SECRET",
    "VITE_API_URL",
    "VITE_FLAG",
    "DENO_TOKEN",
  ]);
});

test("javascript: ignores comments, lowercase keys and unrelated objects", () => {
  const source = [
    "// process.env.COMMENTED",
    "/* process.env.BLOCKED",
    "   process.env.ALSO_BLOCKED */",
    "const a = process.env.lowercase;",
    "const b = config.env.NOT_AN_ENV;",
    "const c = formData.process.env.NOT_THIS;",
  ].join("\n");

  assert.deepEqual(keys(source, "app.js"), []);
});

test("javascript: reports dynamic access without inventing a key", () => {
  const result = extractFromSource("const value = process.env[name];", "app.js");
  assert.deepEqual(result.usages, []);
  assert.equal(result.dynamic.length, 1);
  assert.equal(result.dynamic[0].line, 1);
});

test("python: os.environ, os.environ.get and os.getenv", () => {
  const source = [
    'a = os.environ["DATABASE_URL"]',
    'b = os.environ.get("REDIS_URL")',
    'c = os.getenv("SMTP_HOST", "localhost")',
    "d = os.environ[dynamic_name]",
  ].join("\n");

  const result = extractFromSource(source, "worker.py");
  assert.deepEqual(result.usages.map((usage) => usage.key), ["DATABASE_URL", "REDIS_URL", "SMTP_HOST"]);
  assert.equal(result.dynamic.length, 1);
});

test("go, rust, ruby, php, jvm and csharp", () => {
  assert.deepEqual(keys('os.Getenv("GO_TOKEN")', "main.go"), ["GO_TOKEN"]);
  assert.deepEqual(keys('let t = env::var("RUST_TOKEN").ok();', "lib.rs"), ["RUST_TOKEN"]);
  assert.deepEqual(keys('token = ENV["RUBY_TOKEN"]', "app.rb"), ["RUBY_TOKEN"]);
  assert.deepEqual(keys('$token = getenv("PHP_TOKEN");', "index.php"), ["PHP_TOKEN"]);
  assert.deepEqual(keys('String t = System.getenv("JAVA_TOKEN");', "Main.java"), ["JAVA_TOKEN"]);
  assert.deepEqual(keys('var t = Environment.GetEnvironmentVariable("CS_TOKEN");', "Program.cs"), ["CS_TOKEN"]);
});

test("shell and docker use ${VAR} only", () => {
  const source = [
    "echo ${DEPLOY_ENV}",
    "echo ${DEPLOY_REGION:-us-east-1}",
    "echo $LOCAL_VAR",
    "echo ${lowercase}",
  ].join("\n");

  assert.deepEqual(keys(source, "deploy.sh"), ["DEPLOY_ENV", "DEPLOY_REGION"]);
  assert.deepEqual(keys("RUN ${BUILD_SHA}\n", "Dockerfile"), ["BUILD_SHA"]);
  assert.deepEqual(keys("services:\n  db:\n    image: ${POSTGRES_IMAGE}\n", "docker-compose.yml"), [
    "POSTGRES_IMAGE",
  ]);
});

test("reports the correct line numbers", () => {
  const result = extractFromSource("const a = 1;\n\nconst b = process.env.B_ON_LINE_3;\n", "app.ts");
  assert.deepEqual(result.usages, [{ key: "B_ON_LINE_3", line: 3 }]);
});
