# Artbook

A personal library for visual references. Drop in an image and Artbook names its art style, groups it with similar images, and gives you prompts and searches to find more like it. Everything runs and stays on your computer.

https://github.com/user-attachments/assets/7d09adbe-3a3d-403f-822d-6c361c87af74

## What it does

- **Names the style** of each image and groups matching images into collections.
- **Recognizes known references** (a film, a series, an artist) when it can, and keeps the source link.
- **Writes two prompts** per image: one for a similar image, one for the same style with a new subject.
- **Flags AI-generated images** when the file or a visible watermark says so.
- **Finds more**: search keywords and links to YouTube, Pinterest and Google Images.

## Get started

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Install the Codex CLI and sign in with your ChatGPT account:
   ```
   npm install -g @openai/codex
   codex login
   ```
3. Download this repository and run `npm start` in its folder (on Windows, double-click `Start Artbook.cmd`).
4. Open http://127.0.0.1:4317.

No other setup or API key is needed. Your library is created in a local `data/` folder.

If Artbook can't find Codex, put `codex` on your PATH or set `CODEX_CLI_PATH` to its JavaScript entry point.

## Adding images

- **Paste** an image anywhere on the page (Ctrl+V / Cmd+V).
- **Drop** image files anywhere on the page.
- **Paste a link** to an image or a Pinterest pin.
- Or use **Import images** (the way to go on a phone).

PNG, JPEG and WebP up to 15 MB. Exact duplicates are skipped. You can keep adding images while others are being identified; refreshing the page doesn't lose them.

## On your phone

Start Artbook with `npm run start:network` (or `Start Artbook (network).cmd`). The window shows a link with an access key, like `http://192.168.x.x:4317/?key=…`. Open it once on your phone and it stays signed in.

Only devices with the key can open your library. Anyone you give the link to can browse, edit and delete it, and use your Codex allowance, so share it only with people you trust. Delete `data/access-key.txt` and restart to change the key.

<video src="https://github.com/user-attachments/assets/006a1e4b-0d20-4ddf-b9f6-372915c2e58f" width="300" controls muted></video>

## Privacy and your Codex allowance

- Images and library data stay in the `data/` folder on your computer. Back up that folder to keep your library.
- Images are sent to Codex for analysis using **your own** ChatGPT subscription and count toward its limits. API keys are not used and there is no paid fallback.
- Adding an image straight into a chosen style skips the analysis.

## Your images and copyright

The images you collect belong to their creators. Artbook is a private reference tool: it never publishes your library. Redistributing other people's work, or using the prompts to reproduce specific copyrighted works or characters, may infringe their rights. You are responsible for how you use the images and prompts.

## Development

```
npm run check
```

Runs the syntax checks and the test suite (Node's built-in runner, no dependencies). See `AGENTS.md` for the project map and rules, and `DESIGN.md` for the interface.

## License

[MIT](LICENSE). The display typeface [Instrument Serif](https://github.com/Instrument/instrument-serif) is included under the SIL Open Font License (`public/fonts/OFL.txt`).
