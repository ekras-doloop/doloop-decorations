### The whole product

doloop has three surfaces, one deterministic engine:

- **The editor (this extension)** — the gaze painted where you read.
- **The web cockpit** — paste any public repo at `doloop-read.fly.dev` and get
  a whole-repo map you recolor by lens. Great for a first look.
- **The CLI** —
  - `doloop gaze . --watch` keeps this extension's paint live.
  - `doloop conventions --emit cursor` reads your repo's house style and writes
    it into `.cursor/rules` (or `CLAUDE.md` / `AGENTS.md`) so your AI stops
    writing generic code.

All local, all deterministic — the same classification on every surface.
