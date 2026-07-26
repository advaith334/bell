# Pilcrow

Highlight text anywhere on macOS, press a hotkey, and hear it read back to you in an
ElevenLabs voice — with pauses where paragraphs actually are, and none of the
line-by-line stutter that makes most read-aloud tools unbearable on terminal output.

Pilcrow is Wispr Flow inverted. Flow is `speech → text → active app`; Pilcrow is
`selection → cleanup → speech`.

## Requirements

- macOS 13 or newer (Apple silicon)
- Node 20+
- Xcode command line tools, for the Swift helper
- An [ElevenLabs](https://elevenlabs.io) API key

## Setup

```bash
npm install
npm run build:helper   # compiles swift-helper/dist/pilcrow-helper
npm start
```

On first launch, grant Accessibility permission when prompted and add your
ElevenLabs API key. Either paste it into Settings — where it is encrypted with
Electron's `safeStorage`, backed by the macOS Keychain, and never written to
`settings.json` — or put it in a `.env` at the project root:

```
ELEVEN_LABS_API_KEY=sk_...
```

A key saved through Settings always wins over `.env`, so the two cannot disagree
confusingly.

## Using it

Pilcrow lives in the menu bar, not the dock — the dock icon appears only while the
Home window is open. A small pill sits in the bottom-right corner so you can see
Pilcrow is running: a quiet dot when idle, a level meter and a stop button while
speaking. Click it to start or stop, or press the shortcut (⌥` by default).
The pill is click-through everywhere except the pill itself, so it never eats a
click meant for the window behind it.

Shortcuts are recorded by pressing the combination you want, in Settings. A
modifier is required — a bare key would be swallowed system-wide, so you could
never type it anywhere else.

### A constraint worth knowing

Electron must stay on a build whose bundled Node provides **N-API 10 or newer**
(Electron 35+; this repo is on 43). `better-sqlite3` ships a prebuilt binary
targeting N-API 10, and on an older Electron it does not fail gracefully — it
segfaults during native module registration, so the app dies before any window
appears with no error message. If you ever downgrade Electron and Pilcrow starts
silently failing to launch, this is why.

## How it works

```
hotkey → pilcrow-helper → normalize → chunk → ElevenLabs → MediaSource playback
                                      ↓
                                  SQLite history → Home page
```

**Capture** (`swift-helper/main.swift`) reads `kAXSelectedTextAttribute` from the
focused element. When that is unavailable — terminals, some web views — it falls
back to synthesizing ⌘C, then restores every representation of the previous
pasteboard. It refuses to fire when secure input is active, so a password field
never gets copied to a cloud API.

**Normalization** (`src/main/text/`) is the part that determines whether this
feels good. Stages are pure and independently tested:

| Stage | File | Job |
| --- | --- | --- |
| Clean | `clean.ts` | ANSI codes, entities, smart quotes, box drawing |
| Classify | `source.ts` | terminal / log / markdown / code / prose |
| Reflow | `reflow.ts` | rejoin hard-wrapped lines |
| Shape | `shape.ts` | headings, lists, code policy, URLs, abbreviations |
| Pause | `pauses.ts` | insert `<break>` tags |
| Chunk | `chunk.ts` | split for streaming |

The central idea in `reflow.ts`: **a newline is only a pause if it is a real
paragraph break.** A blank line in the source is a paragraph. Two adjacent lines
are not — they get a 0.15s beat instead of a 0.7s pause. That single distinction
is what stops `npm run build` output from sounding like it is being dictated by
someone with a stutter.

Hard-wrapped prose is detected by finding the modal line width of the selection;
a line landing near that width without terminal punctuation is a wrap, so it is
joined rather than paused on.

**Playback** streams. The first chunk is deliberately small (~180 chars) so audio
starts fast; later chunks are larger for better prosody. Each request passes
`previous_text`/`next_text` so chunk seams do not sound like separate takes.
Audio is cached on disk keyed by text + voice + model + speed, which makes
replays instant and free.

## Home

One page, modelled on Wispr Flow's home but tracking words **spoken aloud**
rather than dictated: a recently-read list with replay, stat cards (today, this
week, streak, listening time), and top source apps.

## Development

```bash
npm test        # 40 tests
npm run typecheck
```

The fixture-style tests in `src/main/text/__tests__/` are the regression suite.
Every "it paused weirdly here" bug should become a test there first.
