# Run and host your own copy

The browser app needs no provider secrets or database. Simulations and imported trace processing happen in the visitor's browser. The server serves React/Worker assets.

## Local development

Use Node 22.13+ and npm. Clone, run `npm ci`, then `npm run dev`. Open the URL printed by the server. If port 3000 is occupied, the server chooses another free port. The bundled example is served from `public/example-trace.json`.

## Local production build

```bash
npm ci
npm run build
npm start
```

`npm start` uses Wrangler's local Worker runtime and prints its URL. This is a local production-artifact smoke test, not an external deployment. Build output is generated under `dist/`.

## Deploy with Sites

The public demo uses Sites. The committed `.openai/hosting.json` identifies that demo and is not a write credential. In your independent fork, register your own Site and replace `project_id` with the value returned for your project. Update `metadataBase` in `app/layout.tsx` and documentation links to your own origin.

Build and validate your fork, save its exact source state using your own Sites credentials, and deploy the resulting version to your intended audience. Never reuse the original project's identifier for publishing. No D1 or R2 resource is needed.

## Deploy directly to Cloudflare

The build emits `dist/server/wrangler.json` with the Worker entrypoint and assets configuration. Use your own Cloudflare account and a unique Worker name. Review the generated configuration before deploying; generated files may include local defaults.

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json --name your-agent-rehearsal
```

The app's core flows have no dependence on a user account service or application database. Verify the app at the deployed URL, the sample trace, and shared links. A direct Cloudflare deployment is documented as an independent hosting option; only the Sites deployment is exercised for the maintained demo.

## Operational checks

Run `npm audit --audit-level=high` and the test suite when updating dependencies. Retain the lockfile. Re-run `npm run test:golden` after engine edits, and make an explicit engine-version decision for behavioral changes. The SDK has no runtime dependency update burden but needs testing across its supported Python versions.

Static GitHub Pages export is not configured in this repository: the web build targets a Worker. GitHub hosts the source and CI, while Sites hosts the interactive demo.
