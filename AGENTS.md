# Artbook

Artbook is a local visual-style reference library. It uses Node.js 22+, native ES modules, and a plain HTML/CSS/JavaScript frontend. There are no npm dependencies or build step.

## Project map

- `server.mjs`: HTTP routes, Codex CLI integration, independent image classification, and visual collection matching.
- `lib.mjs`: library persistence, seed styles, metadata validation, collection matching, and image format validation.
- `remote-image.mjs`: public image downloads and network-address validation.
- `network-access.mjs`: opt-in LAN access (allowed hosts, access key, cookie).
- `ai-origin.mjs`: AI-origin evidence from file metadata and visible watermarks.
- `pinterest.mjs`: Pinterest pin resolution and image downloads.
- `public/index.html`, `public/app.js`, `public/style.css`: browser interface.
- `analysis-schema.json`, `match-schema.json`, `judge-schema.json`, `recalibrate-schema.json`: structured outputs for classification, matching, and test-generation judging and prompt refinement.
- `test/*.test.mjs`: Node's built-in test runner tests.
- `README.md`: setup and supported behavior (demo videos are GitHub-hosted attachments). `PRODUCT.md` and `DESIGN.md`: product and interface guidance.

## Run and verify

- Start with `npm start`; the default URL is `http://127.0.0.1:4317`. Windows also has `Start Artbook.cmd`.
- Run `npm run check` before finishing. This runs the configured syntax checks and the full test suite.
- When editing `pinterest.mjs` or `remote-image.mjs`, also run `node --check` on the edited module; the check script does not explicitly syntax-check those files.
- Follow the existing tests: use temporary data directories and inject deterministic analysis, status, or download functions through `makeApp` where appropriate. Automated checks must not invoke live classification or consume Codex allowance.
- For interface changes, inspect the affected flow at desktop and mobile sizes using `DESIGN.md` and the existing CSS as references. Report any verification that could not be performed.

## Application boundaries

- `data/library.json` and `data/images/` are the user's persisted library. Do not use them as test fixtures, reset them, or rewrite existing collections as part of development.
- Keep the application local by default: loopback binding and cross-origin request rejection are intentional. Network access is opt-in only (`--network` / `ARTBOOK_NETWORK=1`, see `network-access.mjs`): it accepts only this computer's private LAN addresses as the host and requires the access key (query once, then an HttpOnly cookie) from every non-loopback client. Do not weaken these checks or make network mode the default.
- Classification uses the locally signed-in Codex CLI with ChatGPT authentication. Preserve the refusal of API-key authentication and the absence of a billing fallback.
- Classification first identifies the image independently; collection matching happens afterwards. Preserve this separation and conservative matching behavior.
- Test generations never send the reference image to the generator, and the generator gets the subject without its [brackets] (stored prompts keep them); a separate run judges the result against it. A new test makes at most one automatic refined retry; further attempts only come from the user's "Try again" (up to 8 per test). Generated images live in `data/images/generated/`, are never classified or matched, and are removed with their test or image. The critique's evidence regions are only crops of those two images, drawn in the browser.
- Re-identification must preserve the image file and source link; failed analysis must leave its collection unchanged.
- Preserve image format and size checks, redirect validation, public-address restrictions, and DNS address pinning for remote imports.
- Keep the native Node and plain browser implementation; use the existing modules and interface styles when extending behavior.
