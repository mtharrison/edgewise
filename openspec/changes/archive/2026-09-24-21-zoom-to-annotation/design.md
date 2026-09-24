## Context

See proposal.md (Why). The waveform already fetches, for each visible decoder row, the annotations in view, with narrow neighbours merged into dense blocks (`Waveform.tsx` render cache, `engine.annotations`). Plain click on a decoder row selects the annotation in the table (`onPointerUp`). View maths lives in `actions.ts` (`clampView`, `centerOn`) and reads the store, and `api.ts` touches `window` at import, so neither can be imported in a Node test. There is no TypeScript test runner.

## Goals / Non-Goals

**Goals:**
- What is highlighted and framed is exactly what is drawn, including merged blocks.
- The framing maths is covered by unit tests.

**Non-Goals:**
- UI-level automated tests (DOM, canvas). The modifier and highlight behavior is checked by hand.

## Decisions

**Hit-test against the drawn annotations.**
Reuse the per-row annotation lists already cached for drawing, rather than asking the engine again. The pointer's sample is matched against `[start, end]` with a tolerance of 2 CSS pixels, since boxes are drawn at least 1 px wide. Alternative: a new engine call returning the annotation at a sample. Rejected: an extra round trip per pointer move, and it could disagree with what's drawn (the engine doesn't know about dense merging at the current zoom unless it gets the same min-width).

**Modifier: Cmd on macOS, Ctrl elsewhere.**
Checked with `metaKey` when `bridge.platform === 'darwin'`, `ctrlKey` otherwise. On macOS, Ctrl+click is a right-click, so it isn't used there.

**Track the modifier on `window`.**
A `keydown`/`keyup` listener for Meta/Control re-runs the hit test at the last pointer position, so the highlight appears without moving the mouse. A `blur` listener clears it, so the highlight doesn't stick after Cmd+Tab.

**Pure view module for testable maths.**
New `src/renderer/src/view.ts` with no imports: `clampViewTo(view, samples, plotWidth)` (the existing clamp logic, moved) and `frameRange(start, end, plotWidth)` (margin 5% each side, so the range spans 90% of the width). `actions.ts` keeps `clampView` as a thin wrapper that reads the store, and adds `frameAnnotation(start, end)`, which sets the view and `follow: false`. Also `annotationAt(anns, sample, tolerance)` goes here.

**Vitest for renderer tests.**
Vitest works with the existing Vite setup and needs no config for pure modules. `npm test` becomes `cargo test ... && vitest run`, so CI picks it up with no workflow change. Alternative: Node's built-in test runner with type stripping. Rejected: it needs `.ts` extensions in imports, which the rest of the codebase doesn't use.

**Highlight style.**
A brighter 1.5 px outline and a stronger fill on the highlighted box, plus a pointer cursor over it.

## Risks / Trade-offs

- [Ctrl+scroll on Windows and Linux already zooms faster] → Unaffected: this change only handles clicks and key state, not wheel events.
- [Framing a 1-sample annotation hits the 64 px/sample zoom limit, so it can't fill the width] → Accepted; the clamp wins and the annotation is centred (spec scenario "Very short annotation").
- [Hit test uses the last drawn frame, which can lag by one frame during a live capture] → Accepted; the next frame corrects it.

## Follow-ups (candidate backlog issues)

- Packets as a first-class concept: group consecutive annotations separated by less than an idle gap, so a packet can be framed at any zoom, not only when its bytes merge into one block.
