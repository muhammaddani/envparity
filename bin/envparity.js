#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`envparity: unexpected error: ${error?.stack ?? error}\n`);
    process.exitCode = 2;
  });
