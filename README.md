# Ballistic Tracker

A Progressive Web App for precision rifle shooters. Photograph targets, mark impacts, calculate group statistics (MOA, spread, ATZ adjustments), and manage gun/load profiles.

## Quick Start

1. Open `index.html` in a browser, or serve locally:
   ```
   python3 -m http.server 8000
   ```
   Then visit `http://localhost:8000`

2. For mobile testing, use the same local server and access via your phone's browser on the same network.

## Project Structure

See `SPEC.md` for the complete specification.
See `CLAUDE.md` for Claude Code development instructions.

## Testing

```
node tests/test-calculations.js
```

## Tech Stack

- Plain HTML/CSS/JS (no frameworks)
- IndexedDB for local storage
- HTML5 Canvas for image interaction
- PWA for offline support and home screen install
