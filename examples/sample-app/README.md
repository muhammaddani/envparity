# sample-app

A tiny fixture used by `npm run demo`. It intentionally has problems:

- `REDIS_URL` and `SMTP_HOST` are read in `src/worker.py` but missing from `.env.example`
- `OLD_API_URL` is documented in `.env.example` but never read
- `process.env[configKey]` in `src/server.js` is a dynamic lookup

Run it with:

```bash
node bin/envparity.js examples/sample-app
# or fix the example file:
node bin/envparity.js examples/sample-app --fix
```
