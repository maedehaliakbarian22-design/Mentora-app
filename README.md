# Mentora — نمونهٔ آزمایشی (demo prototype)

Local browser prototype of the chapter → lesson → question → feedback → result flow.

**All educational content is DEMO / نمونه آزمایشی.** The only verified item is the chapter title «کیهان، زادگاه عناصر». Lesson text and questions are placeholders with no chemistry facts.

## Run
- Unit tests: `npm test` (Node built-in test runner)
- Browser journey: `npm run e2e` (Python Playwright, uses the system Chrome at /usr/bin/google-chrome)
- Open manually: serve `www/` over HTTP (ES modules do not load from file://)

## Layout
- `www/` static app (no build step, no runtime dependencies)
- `www/js/domain/` pure evaluation and content validation
- `www/js/data/` demo content and local persistence (`localStorage`, defensive reads)
- `test/` unit tests
- `e2e/` browser journey and screenshots

## Not included
- Learning State (not implemented, not exposed)
- Verified textbook content
- Android packaging (Capacitor is not wired in this scratch prototype)
