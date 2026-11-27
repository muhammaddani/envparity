import { readFileSync } from "node:fs";

/** Package version, read once at startup. */
export const version = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
