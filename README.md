# Cutly

A simple, elegant image background remover. Upload an image, Cutly removes the background, download a transparent PNG.

## Features

- **Clean edges** — after segmentation, edge pixels are color-decontaminated (multilevel foreground estimation), so hair and fur don't carry a halo of the old background
- **Change the background** — transparent, solid or custom color, a blurred version of the original, or your own photo
- **Download** as full-resolution PNG or JPG
- **Multiple images** — drop, paste (⌘V), or browse several at once; they're processed in a queue with a thumbnail strip to switch between them
- **Compare slider** to check the cutout against the original
- **Erase / Restore editor**
  - **Smart mode** (default): hover to see which part would be affected, then click it — or drag across a larger part — and just that part is erased or restored. Powered by SAM 2.1 (tiny) via `/api/segment`; the ~155MB model downloads on first use, then each click takes well under a second
  - **Brush mode** for manual touch-ups
  - Zoom (⌘ + scroll), undo/redo (⌘Z / ⇧⌘Z), shortcuts: `S` smart, `B` brush, `E` erase, `R` restore, `[` `]` brush size
- **Sample images** to try it without uploading anything (photos from [Unsplash](https://unsplash.com))

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run the development server — no API key needed, background removal runs locally on-device by default:

```bash
npm run dev
```

The default provider (`birefnet`) downloads a ~224MB model on first use and takes roughly 10-15s per image (plus up to a minute on the very first request, to load the model into memory) — it trades speed for noticeably better edges on hands, hair, and other fine detail. For a faster, lighter alternative with somewhat lower accuracy, set `BACKGROUND_REMOVAL_PROVIDER=local` in `.env.local` (~88MB model, a few seconds per image).

3. (Optional) Use a hosted provider instead by copying `.env.example` to `.env.local` and configuring one:

**Option A — remove.bg**

```
BACKGROUND_REMOVAL_PROVIDER=removebg
REMOVEBG_API_KEY=your_api_key_here
```

Get an API key at [remove.bg/api](https://www.remove.bg/api).

**Option B — Replicate**

```
BACKGROUND_REMOVAL_PROVIDER=replicate
REPLICATE_API_TOKEN=your_token_here
```

Get a token at [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens).

Open [http://localhost:3000](http://localhost:3000).

## Architecture

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **API route**: `/api/remove-background` — handles uploads and delegates to a pluggable provider
- **Providers**: Modular background removal in `src/lib/background-removal/` — swap providers via `BACKGROUND_REMOVAL_PROVIDER`

## Adding a New Provider

1. Create a class implementing `BackgroundRemovalProvider` in `src/lib/background-removal/providers/`
2. Register it in `src/lib/background-removal/index.ts`
3. Set `BACKGROUND_REMOVAL_PROVIDER` in your environment
