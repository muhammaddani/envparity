import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;

// A dynamic lookup: envguard cannot know this key without running the code,
// so it reports it as "dynamic" instead of guessing.
const configKey = "region";
const dynamicValue = process.env[configKey];

export function createApp() {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        ok: Boolean(databaseUrl && jwtSecret),
        port,
        region: dynamicValue ?? null,
      }),
    );
  });
  return server;
}
