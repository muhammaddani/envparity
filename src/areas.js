/**
 * Classify a scanned file as application code, tests, scripts or docs.
 * Used to show where findings come from, so large repositories stay readable.
 */

export function areaOf(file) {
  const path = file.toLowerCase();

  if (
    /(^|\/)(__tests__|tests?|spec|e2e|cypress|playwright|fixtures?|__mocks__|mocks)(\/|$)/.test(path) ||
    /\.(test|spec|e2e)\.[a-z]+$/.test(path) ||
    /(^|\/)test_[^/]+\.py$/.test(path)
  ) {
    return "tests";
  }

  if (/(^|\/)(docs?|examples?|demo|stories|storybook)(\/|$)/.test(path) || /\.mdx?$/.test(path)) {
    return "docs";
  }

  if (/(^|\/)(scripts?|tools?|bin|cli|dev|docker|\.github|\.devcontainer)(\/|$)/.test(path)) {
    return "scripts";
  }

  return "app";
}

export const AREAS = ["app", "tests", "scripts", "docs"];

export function countByArea(usages) {
  const counts = { app: 0, tests: 0, scripts: 0, docs: 0 };
  for (const usage of usages) counts[areaOf(usage.file)] += 1;
  return counts;
}
