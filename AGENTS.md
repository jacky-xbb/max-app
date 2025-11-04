# Repository Guidelines

## Project Structure & Module Organization
- `app.js` boots the Express server and loads configuration from `server/config` before binding core middleware.
- Backend logic is grouped under `server/` with `routes/` for HTTP contracts, `services/` for business flows, `middleware/` for guards, and `utils/` for shared helpers; place new integrations alongside peers.
- Client-facing assets live in `public/`: Tailwind sources compile from `public/css`, and browser scripts ship from `public/js`.
- Supporting artifacts stay in `docs/` and `json/`; keep the signing key at `server/private_key.pem` untouched.

## Build, Test, and Development Commands
- `pnpm install` syncs dependencies to the lockfile.
- `SKIP_OAUTH=true pnpm run dev` runs the nodemon + Tailwind watcher on port 8892 for local work.
- `pnpm start` launches the production Express server against `.env` values; run this before packaging or deploying.
- `pnpm run build` compiles optimized CSS to `public/css/tailwind.output.css`.
- `pnpm run lint` and `pnpm run format` keep backend and public code compliant with ESLint + Prettier.

## Coding Style & Naming Conventions
- Prettier settings: 2-space indent, single quotes, semicolons, 80-character wrap.
- ESLint rules (`no-unused-vars`, `prettier/prettier`) must pass; fix issues rather than silencing them.
- Name backend modules in camelCase (e.g., `cozeTokenManager.js`), keep route files lowercase, and declare environment variables in UPPER_SNAKE_CASE with defaults in config loaders.
- Prefer composing Tailwind utilities in `public/css/tailwind.css`; document any bespoke CSS overrides.

## Testing Guidelines
- Automated suites are pending; after starting the dev server with `SKIP_OAUTH=true`, run `./test-apis.sh` to smoke critical chat endpoints. Ensure `test.webm` is present.
- Add future integration specs under `server/tests` using `*.spec.js` naming, and log manual regression steps in `docs/`.

## Commit & Pull Request Guidelines
- Use Conventional Commits (`fix:`, `refactor:`, `style:`) with subjects under 72 characters that describe observable behavior.
- PRs should link the relevant issue or planning note, list environment toggles touched (`SKIP_OAUTH`, tokens), and attach screenshots or cURL snippets for UI/API changes.
- Run lint and format commands before opening the PR and record the verification results in the description.

## Security & Configuration Tips
- Never commit populated `.env*` files or `server/private_key.pem`; share secrets through secure channels.
- Store Coze and WeCom credentials in local env files, rotate admin tokens after demos, and clear seeded sessions when disabling auth guards.
