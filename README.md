# Artbook

A local reference library for visual styles. Upload PNG, JPEG or WebP images to get a short style name and search keywords. Equivalent styles share a collection. Twelve empty styles are included for discovery. Click a collection to search YouTube, Pinterest or Google Images, add images directly, edit keywords or move a misclassified image.

Paste an image anywhere on the page, drop image files anywhere, or use **Import images**. To import from the web, paste a public image URL, Pinterest pin URL or `pin.it` share link anywhere on the page (outside the search field). Artbook downloads the image, identifies its style, and saves it with its original source link. Open the saved image to revisit its source. Direct image links must return PNG, JPEG or WebP (15 MB maximum); ordinary webpage URLs are not image URLs. HTTP and HTTPS are supported, with public network addresses and standard ports only. Boards, private pins, and hosts that block downloads cannot be imported; upload their image directly instead. Video pins use the preview image, not the video.

## Get started

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Install the Codex CLI and sign in with your ChatGPT account: `npm install -g @openai/codex`, then `codex login`.
3. Download or clone this repository, open a terminal in its folder and run `npm start` (on Windows you can double-click `Start Artbook.cmd`).
4. Open http://127.0.0.1:4317.

Your library is created in a local `data/` folder on first start. Everything stays on your computer; images are sent only to Codex for analysis, using your own subscription.

## Run

You can also copy an image or screenshot and press **Ctrl+V** (or **Cmd+V**) in the library to import it. Clipboard images use the same style analysis and saving flow as uploaded files. Text and URL pasting still work normally in fields.

Requires Node.js 22+ and the Codex CLI signed in with ChatGPT (`codex login`).

```powershell
npm start
```

Open http://127.0.0.1:4317. On Windows, double-click `Start Artbook.cmd` to start the server and open the app. Keep the server running while using Artbook.

No npm dependencies or API key are required. On Windows the server finds the npm-installed Codex CLI under `%APPDATA%`. For another installation, put `codex` on PATH or set `CODEX_CLI_PATH` to its JavaScript entry point.

## Subscription and privacy

Automatic classification invokes `codex exec` with the local ChatGPT sign-in. It refuses API-key authentication, removes API-key environment overrides, and forces the OpenAI provider with ChatGPT authentication. It uses your Codex allowance and is subject to its limits. There is no API-key billing fallback. Adding images directly to a selected style does not invoke AI.

Images are sent to Codex for analysis. Original images and metadata remain in `data/images/` and `data/library.json` on this computer, not in browser storage. Back up the entire `data` directory while the server is stopped. This app is intended for one locally running server, not cloud deployment. By default it listens only on loopback and rejects cross-origin requests.

### Opening Artbook from other devices on your network

Start it with `npm run start:network` (or double-click `Start Artbook (network).cmd`). The window prints a link such as `http://192.168.x.x:4317/?key=…`; open it once on each phone, tablet or computer, and that device is remembered with a cookie. Devices without the key get an access page instead of the library. This computer never needs the key.

- Only this computer's private network addresses (10.x, 172.16–31.x, 192.168.x) are accepted as the host; other names and public addresses are refused.
- The key is stored in `data/access-key.txt`; delete that file and restart to issue a new key and lock out devices that had the old one.
- Anyone with the link can browse, change and delete your library and spend your Codex allowance on imports. Share it only with people you trust, and close the window to stop sharing.
- Windows Firewall must allow Node.js on private networks (Windows asks the first time).

Styles are visual estimates. A still image cannot establish how an animation was produced. Classification is independent: the first pass does not receive existing collection names or tags, and names only view-invariant traits (medium, rendering, realism, shape language, linework, surface), not angle, pose, subject, palette or lighting. A second pass then compares the new image visually with one reference image from up to 8 existing collections and picks a collection only when the style matches regardless of angle or subject. Low-confidence or broad-medium-only matches create a separate collection. An identical name and tag set still groups without the second pass. Tags describe visual qualities such as texture, dimensionality, linework and lighting; click a tag or search to find related references across collections.

Correct a label or its tags with **Edit style & keywords**, or open an image and use **Move to style**. **Re-identify style** analyzes an already saved image using your Codex allowance and places it into a more specific collection when needed. It preserves the file and source link; failed analysis leaves its collection unchanged. Existing collections are not automatically rewritten. Renaming to an existing style merges only when its tags also match.

## Verify

```powershell
npm run check
```

Tests cover grouping, persistence, concurrent writes, merging, moving, upload validation, failed classification, and request isolation. Automated tests use a deterministic analyzer and do not consume subscription allowance.

Official integration references: [Codex authentication](https://developers.openai.com/codex/auth) and [non-interactive mode](https://developers.openai.com/codex/noninteractive).

## Your images and copyright

Artbook is a personal reference tool: it stores the images you collect on your own computer and never publishes them. The images you add remain the property of their creators. Collecting references for private study is common practice, but redistributing, publishing or selling other people's work, or using the generated prompts to reproduce specific copyrighted works or characters, may infringe their rights. You are responsible for how you use the images and prompts. Visual styles describe a look; they are not a license to copy a particular artwork.

## Credits and license

Artbook is released under the [MIT License](LICENSE). The display typeface [Instrument Serif](https://github.com/Instrument/instrument-serif) is included under the SIL Open Font License (`public/fonts/OFL.txt`).
