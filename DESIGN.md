---
name: Artbook
description: A quiet, image-led gallery with a cinematic caption language.
colors:
  paper: "#f4f2ed"
  surface: "#fbfaf7"
  ink: "#1c1f1d"
  muted: "#676a63"
  line: "#e1ded5"
  accent: "#1c1f1d"
  accent-hover: "#000"
  accent-soft: "#eae7df"
  danger: "#a43c36"
  status-connected: "#4f8a5c"
  veil-base: "#0b100e"
  veil-ink: "#f3f1ea"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(42px, 4.4vw, 68px)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-.015em"
  headline:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.15
  body:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  caption:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: ".1em"
    textTransform: "uppercase"
rounded:
  control: "5px"
  reference: "6px"
  dialog: "8px"
spacing:
  base: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  keyword:
    backgroundColor: "transparent"
    rounded: "{rounded.control}"
    padding: "4px 8px"
---

# Design System: Artbook

## Overview

A quiet gallery that lets the references carry all the color. The shell is warm neutral paper and ink; display type is Instrument Serif, metadata uses small tracked capitals like film captions, and every control over an image uses one translucent dark "veil" material. The style modal and the page share the same vocabulary. This describes the implemented interface in `public/style.css`, `public/index.html`, and `public/app.js`; the display face is self-hosted in `public/fonts/` (SIL Open Font License, `OFL.txt`).

## Colors

Ink is the only action color: primary buttons, the active navigation item, links and focus outlines. Paper is the page and sidebar; surface is panels, dialogs and fields' contrast; line draws hairlines; muted carries supporting text and captions. Accent-soft is the hover fill for secondary controls. Danger marks errors and destructive actions. The only green left is the Codex connection dot, where it means "connected".

Empty covers cycle through six muted paired palettes (sage, blue-gray, clay, lavender, straw, stone) as collection placeholders, not action colors. Inside the style modal, color comes from the current image: a 14% tint of its saturation-weighted color, and veil controls are a deep shade of it (same hue, OKLCH lightness .40).

## Typography

- **Display (Instrument Serif):** the wordmark (34px); the library heading (38px); card titles (21px); the style name in the modal (44px); the edit form title (30px). Empty-cover specimen names use the italic.
- **Body (Segoe UI / system sans):** descriptions, prompts, fields and buttons, 12–14px.
- **Caption:** 10px semibold uppercase with .1em tracking for metadata: navigation counts, “Collected / To explore”, style counts, the top bar note, field labels, footer, modal section labels and veil chips.

Text is sentence case except captions; counts use tabular figures.

## Layout

Desktop has a fixed left sidebar (240px) on paper with a hairline right edge, and main content offset by the same amount, with 5% horizontal padding and a maximum width of 1800px. The top bar (76px) holds a caption hint on the left (“Paste, drop or import an image · or paste a link”) and “Add an empty style” plus the primary “Import images” on the right. There is no headline or import panel: the library heading and search sit 34px below, so the art leads. Importing is ambient: paste an image or a link anywhere, drop files anywhere (a page-wide drop layer appears), or use the Import button. The gallery uses three equal columns with 30px row gaps and 24px column gaps; covers are 220px tall.

- At 1600px and above, the gallery has four columns.
- At 1150px and below, the sidebar narrows to 200px, main padding becomes 4%, and the gallery has two columns.
- At 700px and below, the sidebar becomes a compact header: wordmark, then the three views as one swipeable row of single-line pills; its note and connection block are hidden. The top bar note hides and its actions span the row. Main padding is 20px. The gallery shows one card per row (28px gaps, 4:3 covers) and cards show only the cover, serif title (22px) and state; tags, keywords and the inspiration link live in the modal.
- At 700px and below, the style modal is a full-screen sheet with no radius and no close button: the browser/phone back gesture closes it (opening the modal pushes a history entry); the hero is edge to edge at `min(62dvh, 520px)`, tag chips become one swipeable row that fades at the right edge, thumbnails scroll without a visible scrollbar, prompt tabs stay on one line, and “Find more like this” drops the dot separators.

Dialogs use `min(850px, calc(100% - 32px))`, up to 90dvh height, and internal scrolling; the page behind an open dialog does not scroll, and the page keeps a stable scrollbar gutter. The edit dialog is capped at 460px. Dialog padding changes from 30px to 22px on mobile. Clicking the backdrop closes any dialog; a press that starts inside the panel never does.

From 900px wide, the style modal fits the viewport and never scrolls: `min(1320px, 100% - 48px)` by `min(880px, 100dvh - 48px)`, split into a media column (1.3fr) where the image fills the full height edge to edge, and an info column (min 380px) on the tinted surface. The info column is a flex stack: name and thumbnails, then “This image” whose prompt box absorbs leftover height (scrolling inside only when the window is short), then “Find more like this” pinned to the bottom. Below 900px the same content stacks in one scrolling column with the hero full-bleed at the top.

The style modal reads in one fixed order, from most to least important:

1. **Hero carousel:** full-bleed: the references run to the modal's top and side edges with square corners, clipped only by the dialog radius, at `min(64dvh, 600px)` (`min(54dvh, 460px)` on mobile). The art stays clean: no counter, no tags and no menu over it. Only veil arrows appear while pointing at the image (touch screens swipe instead), plus the “Identifying style…” label while a re-identify runs. The close button sits top-right (over the info column on desktop, over the image on narrow screens).
2. **Style identity:** the style name in display serif. On desktop the ⋯ actions button joins the close button as one top-right toolbar (both 28px veil squares, 16px from the top, 8px apart; the menu's right edge aligns with the close button); on narrow screens ⋯ is an outlined square beside the name, and the close button sits over the image. the visual tags as one caption line separated by dots (clickable, no chips; dots drop on phones), then the thumbnails (active one ink-bordered).
3. **This image:** known title and description, a row of tiny palette blocks, tags beyond the style's, and one prompt box with two tabs (Similar image / Same style, new subject) and a single Copy for the visible prompt.
4. **Find more like this:** search keywords and outside search links.

Sections 3 and 4 open with a hairline and a caption label. The lightbox is a separate, chrome-free full-screen dialog: no frame and no generic dim; the whole screen is a light wash of the image's own color (40% tint into paper at 88%) over the blurred page, matching the style modal's backdrop, with the image scaled to the largest size that fits the viewport minus 64px (24px on mobile). It fades in over .35s; a click anywhere closes it.

## Elevation & Depth

The page is flat; hairlines and paper/surface steps define structure. Covers acquire a subtle shadow on hover. Dialogs, menus and toasts share the overlay shadow recorded in the sidecar. Behind the style modal the page blurs (14px) under a light wash of the current art's color (40% tint into paper, 70% opacity), carried by a separate layer because `::backdrop` does not inherit the tint everywhere.

## Shapes

Controls (buttons, fields, chips, navigation, veil controls) use the 5px control radius. Covers, the intake strip and panels use the 6px reference radius; dialogs and the lightbox frame use 6–8px; the actions menu 6px with 4px items; thumbnails 4px. Icons are drawn 1.8px-stroke line icons, never typed glyphs. Gallery covers crop to fill; the hero and lightbox contain the complete image.

## Components

- **Buttons:** primary is an ink fill with surface text; secondary is transparent with an ink hairline at 22% and an accent-soft hover; text buttons are ink and underline on hover. 40px minimum height. Disabled buttons have 0.6 opacity and a waiting cursor.
- **Navigation:** text items on paper; the selected view is an ink fill with surface text and dimmed caption count. Hover uses accent-soft.
- **Gallery cards:** a cover above a serif title with a caption state, quiet hairline tag chips, two keywords and an underlined “Find inspiration” link. Collected styles appear first. The cover is a mosaic of the four newest references (one fills, two split, three use one large tile and two small, four use a 2×2 grid with a “+N” overlay), so duplicates and range show at a glance. Image counts sit on a translucent dark caption badge.
- **Drop layer:** while files are dragged over the window, a full-screen paper veil at 82% with a dashed ink border and a display-serif “Drop to add to your library”. Import progress rows appear under the top bar in a surface panel, with an ink dot pulsing while work is queued or running.
- **Fields and keywords:** search uses an ink hairline underline; fields use paper fill, line borders and the control radius.
- **Veil controls:** the few controls that sit over an image (arrows, the close button when it overlaps the image, the busy label) use one material: a deep shade of the image tint: same OKLCH hue, chroma ×1.15, lightness pinned at .40, at 86% opacity (solid on hover), so it reads as the picture's own deep color rather than black (fallback for older browsers: 45% tint into `#0b100e`), no hairline, 5px corners, caption type and `veil-ink` off-white icons. It reads on images and on the light modal, so no control changes color with scroll.
- **Hero carousel:** scroll-snap slides with veil arrows that appear while pointing at the image (always visible on touch), thumbnails with an ink active border, swipe and ← → keys, wrap-around. Selecting the image opens the lightbox.
- **Actions menu:** one menu from the ⋯ button next to the style name, opening downward, tinted like the modal. “Style”: Add images, Edit style & keywords, Copy all keywords, and Delete style for empty styles. “This image”: Re-identify, Move to another style…, Open original source, Delete image. “Move to another style…” swaps the menu to a move view in place: a back chevron with “Move to”, a search field (focused), and a scrollable list of the other styles A–Z with caption image counts; Enter picks the first match, a click moves the image. Esc steps back to the main view before closing. Deletes need a second press within four seconds. Esc or a click outside closes the menu before the modal.
- **AI origin:** shown only on positive evidence, as the first line of “This image”: a caption tag “AI-generated” (tint-filled, confirmed by file metadata such as Content Credentials, the IPTC AI source type or generator settings) or “Likely AI-generated” (outlined, a visible generator watermark seen by the analysis), followed by the evidence in muted text. Nothing is shown when there is no evidence.
- **Palette:** up to ten 16px blocks (3px radius, faint ink hairline) under the description, most prominent color first, sampled in the browser from the current image. No label or hex text: hovering shows the hex code and share, and a click copies the hex code. Both prompts end with a "Color palette: dominant #…; secondary #…; accents #…." line listing the same colors grouped by coverage (dominant 20% or more, or the top color; secondary 5–20%; accents under 5%), so a copied prompt carries them.
- **Prompt tabs:** an underline tab row (ink 2px under the selected tab, muted otherwise) with Copy on the right; ← → switch tabs; a tab hides when its prompt is missing.
- **Scrollbars:** thin, transparent track, ink thumb at about 30%, the same everywhere; the carousel track never shows one.
- **Busy state:** while Re-identify runs, the hero shows a rotating border, a soft glow pulse, a light sweep and an “Identifying style…” veil label; queued images show a slower, dimmer version and “Waiting in line…”.
- **Feedback:** errors use danger text; toasts use a dark veil fill with surface text and disappear after four seconds. Focus is a 2px ink outline with 3px offset (off-white over images).

Cover shadows transition over 0.2s; drag fill over 0.15s. The lightbox fades and scales in over 0.28s; the actions menu slides 4px over 0.16s; mosaic tiles zoom slightly on hover. Reduced-motion preference disables animations and transitions.

## Do's and Don'ts

- Do let references supply the color; keep the shell to paper, surface, line, muted and ink.
- Do use the display serif for names and headings, captions for metadata, and the veil material for anything over an image.
- Do preserve full-image proportions in detail views and visible keyboard focus.
- Don't reintroduce green or any other brand hue as an action color.
- Don't present empty-style specimens as saved image references.
- Don't place per-image details between the hero and the style name, or repeat style tags as image tags.
- Don't add an eyebrow or label above a heading.
- Don't replace the one-column mobile gallery with an undocumented layout assumption.
- Do keep the art clean: only arrows (on hover) and, on narrow screens, the close button may sit over an image, 16px from the edges.
- Don't put tags, counters or menus over the image.
