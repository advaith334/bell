# Bell — implementation plan

**One line:** highlight text anywhere on macOS, press a hotkey, hear it read aloud in an ElevenLabs voice, with sane pauses and no robotic line-break stutter.

Think of it as Wispr Flow inverted: Flow is `speech → text → active app`; Bell is `selected text → cleanup → speech`.

---

## 1. Stack decision

| Piece | Choice | Why |
| --- | --- | --- |
| Shell | **Electron + electron-forge + TypeScript** | Mirrors `aria-flow/desktop` exactly, so patterns (forge config, IPC, tray, hidden windows, Sentry, auto-update) are copy-adaptable. Also gives us MediaSource/Web Audio for free, which is the hard part of streaming playback. |
| Native bits | **One small Swift sidecar binary** (`bell-helper`) | Reading `kAXSelectedTextAttribute` and synthesizing ⌘C both require native macOS APIs. `aria-flow/desktop/swift-helper-app` already has this exact code — see `AXUIElement+Properties.swift:790` (`highlightedText`) and `AXContext.swift`. We port ~150 lines, not the whole helper. |
| TTS | **ElevenLabs `eleven_flash_v2_5`** streaming | ~75ms model latency, supports `<break time="1.0s"/>` tags, cheap. `eleven_turbo_v2_5` or `multilingual_v2` selectable in settings for higher quality. |
| Audio out | **Hidden renderer + MediaSource Extensions**, mp3_44100_128 chunks | Gives pause/resume/seek/speed and gapless append with zero native code. |

Tauri is the alternative (smaller binary, Rust IPC) and my prior Tauri setup worked fine — but we'd lose MSE-quality audio ergonomics and all the aria-flow reuse. **Recommend Electron.** Revisit if bundle size becomes a real complaint.

---

## 2. Architecture

```
┌──────────────── Electron main ─────────────────┐
│ hotkeyService   ── globalShortcut / uiohook    │
│ selectionService ── spawns bell-helper (JSON)  │
│ normalizeService ── ANSI/md strip, reflow, SSML│
│ chunker          ── sentence-aware splitting   │
│ ttsService       ── ElevenLabs stream + cache  │
│ playbackBridge   ── IPC to audio renderer      │
└────────┬───────────────────────┬───────────────┘
         │                       │
   ┌─────▼──────┐        ┌───────▼────────┐
   │ audio win  │        │  HUD overlay   │
   │ (hidden)   │        │ transparent,   │
   │ MSE <audio>│        │ always-on-top  │
   └────────────┘        └────────────────┘
         │
   ┌─────▼────────────────────────────────┐
   │ bell-helper (Swift, spawned on demand)│
   │  AXSelectedText → else ⌘C + pasteboard │
   └───────────────────────────────────────┘
```

Repo layout:

```
bell/
  package.json, forge.config.ts, tsconfig.json
  src/
    main/
      index.ts
      services/{hotkey,selection,tts,playback,cache,settings,history}.ts
      db/{index.ts,migrations/}         ← better-sqlite3, utterances table
      text/{ansi.ts,markdown.ts,reflow.ts,pauses.ts,chunk.ts,pipeline.ts}
      text/__tests__/*.test.ts          ← the fixture corpus lives here
    renderer/
      audio/                            ← hidden MSE player
      hud/                              ← React overlay
      home/                             ← the single page + settings modal
    shared/{ipc.ts,types.ts}
  swift-helper/                         ← bell-helper Xcode/SPM package
```

---

## 3. Capture: getting the highlighted text

Two-tier, in `selectionService`:

1. **Accessibility read (preferred, invisible).** Helper gets the focused app's focused UI element via `AXUIElementCreateSystemWide` → `kAXFocusedUIElementAttribute`, then reads `kAXSelectedTextAttribute`. Port `highlightedText` from `AXUIElement+Properties.swift:790`. Works in native apps, Xcode, Notes, Mail, most Electron apps with a11y on.
2. **Clipboard fallback.** If AX returns empty/unsupported (Terminal, some web views, Figma):
   - snapshot `NSPasteboard.general.changeCount` + all items,
   - synthesize ⌘C via `CGEvent` with `.cghidEventTap`,
   - poll changeCount for up to ~120ms,
   - read the string, **restore the original pasteboard**, return.

Helper is a short-lived process invoked as `bell-helper get-selection --allow-clipboard`, replying with one JSON line on stdout. Short-lived keeps it crash-isolated; if latency measures badly we make it a long-running process over a unix socket (aria-flow's helper does this — pattern is there to copy).

**Permissions:** Accessibility only (no mic, no screen recording). Prompt on first run with a proper explainer screen, same shape as aria-flow's onboarding. Copy the split-screen accessibility prompt pattern: request at the moment the user first uses the feature, not at launch.

---

## 4. The hotkey

Bare `` ` `` **cannot** be the default — `globalShortcut` swallows the key process-wide, so you could never type a backtick again. Options, in order:

1. **Default: `⌥` + `` ` ``** (Alt+backtick) via `globalShortcut.register('Alt+`')`. Unused on US layouts, one hand, close to what you asked for.
2. **Double-tap `` ` `` opt-in** via `uiohook-napi`: passive listener, two backticks inside 300ms fires Bell and we *don't* consume the keystrokes — the two backticks still type. Slightly odd but this is the "just backtick" experience if you want it.
3. Fully rebindable in settings, stored via `electron-store`.

Same key while playing = **stop**. `⌥⇧`` ` = pause/resume. Escape = stop.

---

## 5. Text normalization — the actual hard part

This is where the product lives or dies. Pipeline in `src/main/text/pipeline.ts`, each stage pure and unit-tested:

**Stage 0 — decode/clean**
`strip-ansi` (ANSI escapes, terminal color codes) → `he.decode` (HTML entities) → normalize unicode (NFC), smart quotes → plain, non-breaking spaces → spaces, strip zero-width chars.

**Stage 1 — source sniffing** (cheap heuristics, sets a `SourceKind`)
- Frontmost app bundle id from the helper (`com.apple.Terminal`, `com.googlecode.iterm2`, `dev.warp.*` → `terminal`).
- ≥30% of lines start with a log prefix (`\d{2}:\d{2}:\d{2}`, `[INFO]`, `WARN`) → `log`.
- Fenced blocks / `#` headings / `- ` bullets → `markdown`.
- Otherwise `prose`.

**Stage 2 — line reflow (fixes the terminal stutter)**
The rule: **a newline is only a pause if it's a real paragraph break.** Join `line[i]` with `line[i+1]` unless any of:
- next line is blank (→ paragraph break),
- current line ends in `.?!:;"”)` or an em dash,
- current line is short *and* the ones around it are also short and similar length (a hard-wrapped block at ~72–100 cols is still one paragraph — join it),
- next line starts a list item / heading / numbered item,
- indentation changes sharply (code block, quoted email),
- `SourceKind === 'terminal'` and the next line starts with a prompt-ish token (`$`, `%`, `>`, `➜`, `user@host`).

For hard-wrapped prose specifically: detect the modal line length; if a line is within ~10 chars of it and doesn't end in terminal punctuation, it's a wrap → join with a space, not a pause. This single rule kills 90% of the "weird pause every line" problem.

**Stage 3 — content shaping**
- Markdown: parse with `unified` + `remark-parse`, walk the AST rather than regexing. Headings → sentence + long pause. Lists → item + short pause. Links → speak the label, drop the URL. Emphasis → drop markers.
- **Code blocks / obvious code:** default **skip and announce** — "code block, twelve lines, skipped." Reading `const x = arr.map(...)` aloud is useless. Setting: skip / summarize / read verbatim.
- **Bare URLs:** "link" or the domain only, never the full path.
- Tables: read row-wise with a short pause per cell, or skip if wide.
- Long digit runs, `SHA` hashes, file paths: collapse ("path, dot dot dot, index dot t s").
- Abbreviations: `e.g.` → "for example", `i.e.`, `etc.`, `vs.` — small dictionary so they don't get read as sentence ends.

**Stage 4 — pause injection**
Sentence-segment with `Intl.Segmenter('en', {granularity:'sentence'})` (built in, no dep) with an abbreviation guard, then insert ElevenLabs break tags:

| Boundary | Tag |
| --- | --- |
| Sentence | none — the model already handles `.` well |
| List item | `<break time="0.35s"/>` |
| Paragraph | `<break time="0.7s"/>` |
| Heading (before/after) | `<break time="1.0s"/>` |
| Section / `---` | `<break time="1.2s"/>` |

Cap at ~3s per tag and a handful per request — ElevenLabs gets unstable past that; if we need a longer gap, emit silence client-side instead. All durations live in one config object so they're tunable without touching logic.

**Optional Stage 5 — LLM cleanup (setting, off by default).** For genuinely messy input (a scraped page, a stack trace, a chat log), one Haiku 4.5 call: "rewrite this for text-to-speech; preserve meaning; drop UI chrome, timestamps, and code; mark paragraph breaks." Adds ~400ms so it's opt-in, or auto-triggered only when heuristics flag the input as low-confidence (e.g. >40% of lines look like chrome). The heuristics stay the default path so the common case is instant.

**Test approach:** a fixture corpus in `src/main/text/__tests__/fixtures/` — real captures from Terminal, iTerm, a git log, a Slack thread, a Notion doc, a GitHub markdown README, a PDF selection with hyphenated line breaks, an email with `>` quoting. Each has a snapshot of expected normalized output. This corpus is the regression suite; every "it paused weirdly here" bug becomes a fixture.

---

## 6. Chunking, streaming, latency

- Chunk on sentence boundaries. **First chunk small (1–2 sentences)** so audio starts fast; subsequent chunks ~600–1000 chars for prosody and fewer requests.
- Never split inside a `<break>` tag or mid-sentence.
- Send each chunk to `POST /v1/text-to-speech/{voice}/stream` with `previous_text` / `next_text` set to the neighbouring chunk text — this is what keeps prosody continuous across chunk seams instead of each chunk sounding like a fresh take.
- `optimize_streaming_latency` tuned per model; `output_format=mp3_44100_128`.
- Prefetch chunk N+1 while N plays; keep at most 2 in flight (cost control + easy cancel).
- On stop: abort in-flight fetches, `MediaSource.endOfStream()`, reset.

Latency budget for first audio:

| Step | Target |
| --- | --- |
| Hotkey → helper reply (AX path) | 20–60ms |
| Clipboard fallback path | +100–150ms |
| Normalize + chunk | <10ms |
| ElevenLabs TTFB (flash v2.5) | 150–300ms |
| MSE first append → sound | ~50ms |
| **Total** | **~250ms (AX) / ~450ms (clipboard)** |

**Cache:** `sha256(normalizedText + voiceId + modelId + settings)` → mp3 on disk under `app.getPath('userData')/tts-cache`, LRU-capped (say 500MB). Re-reading the same paragraph is then instant and free. Meaningful — people re-listen constantly.

---

## 7. UI surface

Three windows, and only one of them is a real page.

### 7a. Home — the only page

We take the *shape* of `aria-flow/desktop/src/renderer/pages/main/Home/index.tsx` and none of the rest of the hub. No History tab, no Notes, Notetaker, Insights, Personalization, Polish, Extensions, Tasks, Ask. One window, one view, no sidebar nav.

The core inversion: Flow's headline stat is **words dictated**; ours is **words spoken aloud**.

```
┌──────────────────────────────────────────────────────────┐
│  Hey Advaith — 48,120 words read back to you             │  ← WelcomeHeader analogue
│  Highlight anything and hit ⌥`                           │     (keytip until ~2k words, then
├────────────────────────────────┬─────────────────────────┤      just "Welcome back")
│  RECENTLY READ                 │  ┌───────────────────┐  │
│  ┌──────────────────────────┐  │  │ Today       1,240 │  │  ← CardStack analogue
│  │ ▸ "The migration runs…"  │  │  │ This week   8,903 │  │
│  │   Terminal · 2m ago      │  │  │ Streak       6 d  │  │
│  │   412 words · 2m 51s     │  │  │ Listened    4h 12m│  │
│  └──────────────────────────┘  │  └───────────────────┘  │
│  ┌──────────────────────────┐  │  ┌───────────────────┐  │
│  │ ▸ "Section 4 covers…"    │  │  │ TOP SOURCES       │  │  ← TopApps analogue
│  │   Preview · 1h ago       │  │  │ Chrome      41%   │  │
│  └──────────────────────────┘  │  │ Terminal    22%   │  │
│                                │  │ Preview     14%   │  │
└────────────────────────────────┴─────────────────────────┘
```

**Recently read** (the `RecentActivity` analogue) is the heart of it. Each row is one read-aloud session:
- first ~80 chars of the normalized text, expandable to full,
- source app icon + name, relative timestamp,
- word count and audio duration,
- **replay button** — plays straight from the mp3 cache, so it's instant and costs nothing. This is why the cache in §6 earns its keep twice.
- row actions: copy text, delete, "read again from here."

Grouped by day (Today / Yesterday / date), infinite scroll, searchable by content or source app.

**Stat cards** track spoken output, not input: words read aloud today / this week, day streak, total listening time, and optionally ElevenLabs credits used this month.

**Top sources** replaces Top Apps — which apps you read *from* most, by word share.

That's the whole page. No hero banner router, no feature tours, no incident banners.

### 7b. HUD
Transparent, always-on-top, click-through-except-controls, near the bottom of the screen. State (capturing → thinking → speaking), progress bar, current sentence, stop/pause/speed. Auto-hides ~1s after finish. This is what you actually interact with 95% of the time — Home is where you go to find something you heard earlier.

### 7c. Settings + tray
Tray menu: play/stop, voice, speed, open Home, settings, quit. Settings window (or a modal on Home — probably simpler): API key in Keychain via `keytar`, voice, model, speed, hotkeys, code-block policy, pause-length sliders, LLM-cleanup toggle, cache size/clear.

Onboarding: 3 screens — Accessibility permission, ElevenLabs key, try-it-now demo.

### 7d. Data model

SQLite via `better-sqlite3` at `userData/bell.sqlite` — one table does nearly everything:

```sql
CREATE TABLE utterances (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  raw_text      TEXT NOT NULL,      -- exactly what was captured
  spoken_text   TEXT NOT NULL,      -- post-normalization, minus break tags
  word_count    INTEGER NOT NULL,
  duration_ms   INTEGER,            -- filled in when playback ends
  completed     INTEGER NOT NULL,   -- 0 if the user hit stop early
  source_app    TEXT,               -- bundle id
  source_kind   TEXT,               -- terminal | markdown | log | prose
  voice_id      TEXT,
  model_id      TEXT,
  cache_key     TEXT,               -- → mp3 on disk, powers replay
  chars_billed  INTEGER
);
CREATE INDEX idx_utterances_created ON utterances(created_at DESC);
```

Stat cards are plain aggregate queries over this; `word_count` is counted on `spoken_text` so skipped code blocks don't inflate the headline number. Retention setting: keep forever / 90 days / 30 days, with text-only mode that drops cached audio but keeps history.

---

## 8. Build order

**Phase 1 — spike (~1 day).** Hotkey → helper (clipboard path only) → dump raw text to console. Proves the permission + capture loop end to end. Nothing else.

**Phase 2 — speak it.** Naive one-shot ElevenLabs call, play via a hidden renderer `<audio>` with a blob URL. First working demo. Ugly, laggy, correct.

**Phase 3 — normalization pipeline + fixture corpus.** The real work. Build against the fixtures, not against vibes.

**Phase 4 — streaming + chunking + MSE.** Take first-audio from ~2s to ~300ms.

**Phase 5 — AX capture path** in the Swift helper, clipboard demoted to fallback. Removes the pasteboard-clobbering risk and a chunk of latency.

**Phase 6 — HUD, controls, settings, cache.** Write every session to `utterances` from Phase 2 onward, though — the history table costs almost nothing to populate early and having real rows makes Phase 6b easy.

**Phase 6b — Home page.** Header + recently-read list + stat cards + top sources, on top of the data already accumulating.

**Phase 7 — polish.** Onboarding, auto-update (`electron-updater`), Sentry, notarized signed build, per-app rules (e.g. "always skip code in Terminal"), usage/cost counter.

---

## 9. Risks & open calls

| Risk | Mitigation |
| --- | --- |
| Clipboard fallback clobbers the user's pasteboard | Snapshot **all** pasteboard items (not just the string) and restore after; never fire ⌘C when AX already returned text. |
| Synthetic ⌘C fails in secure-input contexts (password fields, some terminals) | Detect `IsSecureEventInputEnabled`; refuse and show "can't read from this app" rather than firing a blind ⌘C. |
| ElevenLabs cost on long selections | Hard cap (~5k chars default) with a "read anyway" confirm; disk cache; per-session credit counter in the HUD. |
| `<break>` tags degrade quality if overused | Cap per request; prefer paragraph-level chunk splits with client-side silence for long gaps. |
| `uiohook-napi` is a native dep with rebuild pain | Double-tap mode is opt-in; the `globalShortcut` default path has no native dep at all. |
| Selection changes between hotkey and capture | Capture synchronously in the helper on the first frame after the hotkey; no async gap. |

**Decisions I'd want from you before Phase 3:**
1. Default hotkey — `⌥`` `, or do you actually want double-tap backtick as the default?
2. Code blocks — skip with an announcement (my default), or read them?
3. Is the LLM cleanup pass worth the extra ~400ms as an auto-trigger for messy input, or keep it strictly manual?

---

## 10. Dependencies

`electron`, `@electron-forge/*`, `typescript`, `react` (HUD/settings only), `@elevenlabs/elevenlabs-js`, `strip-ansi`, `he`, `unified` + `remark-parse` + `mdast-util-to-string`, `electron-store`, `keytar`, `uiohook-napi` (optional), `electron-updater`, `jest`. Sentence segmentation and unicode normalization use built-in `Intl.Segmenter` / `String.normalize` — no dep.
