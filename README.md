# Artbook

A personal library for visual references. Drop in an image and Artbook names its art style, groups it with similar images, and gives you prompts and searches to find more like it. Everything runs and stays on your computer.

https://github.com/user-attachments/assets/7d09adbe-3a3d-403f-822d-6c361c87af74

## What it does

- **Names the style** of each image and groups matching images into collections.
- **Recognizes known references** (a film, a series, an artist) when it can, and keeps the source link.
- **Writes two prompts** per image: one for a similar image, one for the same style with a new subject.
- **Tests the style prompt**: "Test this prompt" makes an image from the prompt alone (not the reference), rates how closely its style matches the original, and, below 70%, refines the prompt and tries once more. "Try again" in the test reworks the prompt of the attempt you are viewing (aware of how every attempt scored) for another attempt, up to 8 per test; each attempt gets its own tab. Key phrases in the critique, and in what already works, link to side-by-side crops of the original and the attempt, so you can see what it means. Results and reasoning are saved with the image; delete them any time, or make a refined prompt the image's style prompt. This uses more of your Codex allowance than identifying an image.
- **Tests the style as a vector drawing**: set "Test as" to "SVG · Claude" or "SVG · Codex" and the model draws the style as SVG code from the prompt alone, one layer at a time (sketch, color and tone, line and detail, finish), looking at a render of the drawing so far before each layer. While it draws you can watch the drawing grow over the reference (live as it is written with Claude, layer by layer with Codex). The finished drawing is judged like an image test; the Process strip shows each layer and Play replays the drawing shape by shape. "Try again" redraws only the layers its critique concerns. The downloaded SVG keeps the layers as named groups. Rendering needs Microsoft Edge or Google Chrome installed.
- **Flags defects and limits**: the judge also lists what is wrong in the attempt whatever the style (mangled hands, merged objects, garbled text, broken perspective), each with a close-up, and says whether another try will likely fix it or it is probably a model limit. It also marks critique points a prompt alone probably can't fix. None of this changes the style score. When the last 3 attempts score within 3 points, the test says more tries alone probably won't help much.
- **Takes your notes**: in a test, "Add note" lets you mark a spot on the original or the attempt (drag a box, or tap for a small one) and write what should change or stay, or leave a general note. Notes are saved with the attempt, shown as numbered boxes, and open up close. "Try again" works on your notes before the critique: for an image the prompt refiner also sees the attempt and where each note points; for a drawing only the shapes under your box are edited.
- **Frames the test**: choose a shot size (wide to extreme close-up) and a camera angle (eye level, high, low, Dutch tilt, overhead, ground level), each shown with an example picture. The choice is added to the test prompt after the subject; it is not saved into the style prompt.
- **Checks the identification**: in a test, "Check identification" looks at the image again with what its tests found and suggests changes to its style name, tags and collection, each with a confidence and a reason. Nothing changes until you apply a suggestion.
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

To draw with Claude (optional), install [Claude Code](https://claude.com/claude-code) and sign in with your Claude subscription (`claude auth login`). If it is not on your PATH, set `CLAUDE_CLI_PATH`. If Edge or Chrome is installed somewhere unusual, set `ARTBOOK_BROWSER` to its executable.

## Adding images

- **Paste** an image anywhere on the page (Ctrl+V / Cmd+V).
- **Drop** image files anywhere on the page.
- **Paste a link** to an image or a Pinterest pin.
- Or use **Import images** (the way to go on a phone).

PNG, JPEG and WebP up to 15 MB. Exact duplicates are skipped. You can keep adding images while others are being identified; refreshing the page doesn't lose them.

## On your phone

Start Artbook with `npm run start:network` (or `Start Artbook (network).cmd`). The window shows a link with an access key, like `http://192.168.x.x:4317/?key=…`. Open it once on your phone and it stays signed in.

Only devices with the key can open your library. Anyone you give the link to can browse, edit and delete it, and use your Codex allowance, so share it only with people you trust. Delete `data/access-key.txt` and restart to change the key.

https://github.com/user-attachments/assets/006a1e4b-0d20-4ddf-b9f6-372915c2e58f

## Privacy and your Codex allowance

- Images and library data stay in the `data/` folder on your computer. Back up that folder to keep your library.
- Images are sent to Codex for analysis using **your own** ChatGPT subscription and count toward its limits. API keys are not used and there is no paid fallback.
- Drawing with Claude uses **your own** Claude subscription through Claude Code. Only the prompt goes to Claude, never the reference image; API keys are refused.
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
