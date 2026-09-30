# Design

## Context

All view limits live in one pure function, `clampViewTo(start, spp, samples, plotWidth)` in `src/renderer/src/view.ts`, called through `clampView` in `actions.ts` by zoom, pan, `centerOn`, `frameSpan` and the overview strip. It works in samples and knows nothing about time. Today it caps samples-per-pixel at 4× the capture over the plot width and keeps `start` within half a visible width of either end. `fit()` sets the view directly without clamping.

## Goals / Non-Goals

**Goals:**
- One place enforces the new limits, so every navigation path gets them for free.
- Keep `clampViewTo` pure and unit-testable.

**Non-Goals:**
- Touching `fit()` or follow mode; fit already shows exactly the capture, which is inside the new limits.

## Decisions

- **Margin in time, converted to samples.** `clampViewTo` gains a `samplerate` argument and computes `margin = 0.010 * samplerate` samples. `clampView` passes `status.samplerate`. Alternative: pass a pre-computed margin in samples; rejected because the 10 ms rule then leaks into every caller.
- **Zoom-out cap:** `spp ≤ (n + 2·margin) / plotWidth`, where `n` is the sample count (at least 1).
- **Pan bounds:** `start ∈ [-margin, n + margin - visible]`, with `visible = spp · plotWidth`. Because the zoom-out cap guarantees `visible ≤ n + 2·margin`, the interval is never empty.
- **"Before 0" means before the capture start.** The issue speaks of 0 on the ruler. With no trigger, 0 is the capture start. With a trigger, the ruler's 0 is the trigger point and pre-trigger data sits at negative times; limiting to 10 ms before the trigger would hide that data, so the margin is measured from the capture's first sample instead.
- **Zoom-in cap unchanged** at 1/64 sample per pixel, applied before the zoom-out cap, as today.

## Risks / Trade-offs

- [For captures much shorter than 10 ms, the fixed margin dominates the fully zoomed-out view (a 1 ms capture can be zoomed out to 21 ms)] → Accepted as the issue asks for a fixed ~10 ms; a margin that scales with capture length can be a follow-up if the reviewer wants it.
- [An empty capture (0 samples) has no meaningful rate-based bounds] → Treated as one sample, as today, so the view is simply the 10 ms margins around it.
- [Sample rate is 0 or missing before the first status arrives] → Fall back to a margin of 0 samples so the view clamps to the capture.

## Open Questions

- Whether short captures should use a margin proportional to capture length instead of a fixed 10 ms. Deferrable: it changes only the margin formula, not the approach or tasks.
