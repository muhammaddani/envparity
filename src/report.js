const SYMBOLS = { fail: "✖", warn: "⚠", info: "?", ok: "✔", arrow: "→" };

function palette(enabled) {
  const wrap = (code) => (text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : String(text));
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    cyan: wrap("36"),
  };
}

function padEnd(text, width) {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatLocations(files, limit = 2) {
  const parts = [];
  let seen = 0;
  for (const entry of files) {
    for (const line of entry.lines) {
      if (seen === limit) {
        const hidden = files.reduce((sum, item) => sum + item.lines.length, 0) - limit;
        if (hidden > 0) parts.push(`+${hidden} more`);
        return parts.join(", ");
      }
      parts.push(`${entry.file}:${line}`);
      seen += 1;
    }
  }
  return parts.join(", ");
}

/**
 * Render the human-readable report.
 * @param {object} result
 * @param {{color?: boolean}} [options]
 */
export function formatHuman(result, options = {}) {
  const c = palette(options.color === true);
  const lines = [];

  const header = [
    c.bold("envguard"),
    c.dim(result.version),
    c.dim("·"),
    `scanned ${plural(result.scannedFiles, "file")}`,
    c.dim("·"),
    `example ${result.exampleFile}`,
  ];
  lines.push(header.join(" "));
  if (result.envFile) lines.push(`  ${c.dim("env")} ${result.envFile}`);
  lines.push("");

  if (result.added.length > 0) {
    lines.push(c.green(`${SYMBOLS.ok} Added ${plural(result.added.length, "key")} to ${result.exampleFile}`));
    for (const key of result.added) lines.push(`    ${key}`);
    lines.push("");
  }

  if (result.missing.length > 0) {
    lines.push(
      c.red(`${SYMBOLS.fail} ${plural(result.missing.length, "variable")} used in code but missing from ${result.exampleFile}`),
    );
    for (const item of result.missing) {
      lines.push(`    ${c.bold(padEnd(item.key, 24))}${c.dim(formatLocations(item.files))}`);
    }
    lines.push("");
  }

  if (result.undeclared.length > 0) {
    lines.push(
      c.red(`${SYMBOLS.fail} ${plural(result.undeclared.length, "variable")} used in code but not set in ${result.envFile}`),
    );
    for (const item of result.undeclared) {
      lines.push(`    ${c.bold(padEnd(item.key, 24))}${c.dim(formatLocations(item.files))}`);
    }
    lines.push("");
  }

  if (result.unused.length > 0) {
    lines.push(
      c.yellow(`${SYMBOLS.warn} ${plural(result.unused.length, "variable")} documented in ${result.exampleFile} but never used in code`),
    );
    for (const item of result.unused) {
      const location = item.line ? `${result.exampleFile}:${item.line}` : result.exampleFile;
      lines.push(`    ${c.bold(padEnd(item.key, 24))}${c.dim(location)}`);
    }
    lines.push("");
  }

  if (result.dynamic.length > 0) {
    const label = result.dynamic.length === 1 ? "dynamic access" : "dynamic accesses";
    lines.push(c.cyan(`${SYMBOLS.info} ${result.dynamic.length} ${label} could not be verified`));
    for (const item of result.dynamic) {
      lines.push(`    ${c.dim(`${item.file}:${item.line}`)}  ${item.text}`);
    }
    lines.push("");
  }

  const clean =
    result.missing.length === 0 && result.unused.length === 0 && result.undeclared.length === 0;
  if (clean) {
    if (result.summary.used === 0 && result.summary.documented === 0) {
      lines.push(c.green(`${SYMBOLS.ok} No environment variable usage found.`));
    } else {
      lines.push(
        c.green(`${SYMBOLS.ok} All ${plural(result.summary.used, "variable")} used in code are documented.`),
      );
    }
    lines.push("");
  }

  const summary = [
    `${result.summary.used} used`,
    `${result.summary.documented} documented`,
    `${result.summary.missing} missing`,
    `${result.summary.unused} unused`,
  ];
  if (result.envFile) summary.push(`${result.summary.undeclared} undeclared`);
  lines.push(c.dim(summary.join(" · ")));

  if (result.summary.missing > 0 && !result.fixed) {
    lines.push("");
    lines.push(
      c.dim(
        `${SYMBOLS.arrow} Run \`envguard --fix\` to add ${plural(result.summary.missing, "missing key")} to ${result.exampleFile}.`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Render the machine-readable report.
 * @param {object} result
 */
export function formatJson(result) {
  return `${JSON.stringify(
    {
      version: result.version,
      root: result.root,
      exampleFile: result.exampleFile,
      envFile: result.envFile,
      scannedFiles: result.scannedFiles,
      languages: result.languages,
      summary: result.summary,
      missing: result.missing.map((item) => ({
        key: item.key,
        usages: item.usages.map(({ file, line }) => ({ file, line })),
      })),
      unused: result.unused,
      undeclared: result.undeclared.map((item) => ({
        key: item.key,
        usages: item.usages.map(({ file, line }) => ({ file, line })),
      })),
      dynamic: result.dynamic,
      added: result.added,
    },
    null,
    2,
  )}\n`;
}
