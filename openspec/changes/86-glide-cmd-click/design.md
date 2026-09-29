# Design

## Context

The view is a `{ start, spp }` pair in the renderer store. Every navigation action in `src/renderer/src/actions.ts` computes a target and sets it in one step. `frameSpan` is what Cmd/Ctrl+click uses to frame an annotation or burst, and the Cmd/Ctrl+click handlers in `Waveform.tsx` are its only callers. So animating `frameSpan` changes only the behaviour this change covers.

The prototype on `prototype/86-glide-cmd-click` (80b1f92) already does this: a pure `viewPath` in `view.ts` with unit tests, a `glideTo` in `actions.ts`, and a passing `scripts/checks/cmd-click-glide.mjs`. The implementation starts from that code.

## Goals / Non-Goals

**Goals:**
- Keep the path maths pure and unit-testable, apart from the timing loop.
- Don't touch any other navigation action. They stay instant because they still set the view directly.

**Non-Goals:**
- A general animation system for the view. Only `frameSpan` glides.

## Decisions

**Path: van Wijk & Nuij smooth zoom-and-pan, with ρ = √2.** The path treats the view as a centre and a visible width (`spp × plotWidth`) and follows the optimal path from the paper. Along it, perceived speed is constant and a long pan zooms out on the way. The paper also gives a path length, which we use to scale the duration. Two alternatives were rejected. Interpolating start and spp linearly or geometrically gives no zoom-out on far jumps, and the target can shoot past before it is visible. A plain zoom-out, pan, zoom-in sequence has visible corners. When the centres coincide, the path reduces to a pure zoom about that centre.

**Timing: requestAnimationFrame, with duration = clamp(180 + 110·length, …, 480) ms and ease-out cubic.** These are the prototype's values, which the issue says felt right. The path is evaluated at the eased parameter. The last frame sets the exact target, so the glide ends precisely where the instant jump would, and the target is clamped up front with the same `clampView` as today.

**Takeover by identity check.** Each frame, the glide compares the store's current view with the last view it set itself. If they differ, something else has set the view (wheel, drag, keys, fit, a new capture or file load, a resize re-clamp), so the glide stops without writing. The other actions therefore need no changes, and they naturally apply from the view at that moment. We rejected a cancel call added to every navigation action, because it is easy to miss one. A new glide cancels the pending frame and starts from the current view.

**Reduce motion via `matchMedia('(prefers-reduced-motion: reduce)')`,** checked on each Cmd/Ctrl+click. Chromium in Electron maps this to the OS setting. Playwright's `emulateMedia({ reducedMotion })` can drive it in the UI check. When it matches, or when the path length is zero or not finite, the view is set in one step.

**Follow mode off and hover measurement cleared at the start.** `follow: false` is set right away, as today. The prototype also clears a stale hover measurement once when the glide starts. The pulse under the pointer changes as the view moves, and the existing pointer-move handling recomputes it afterwards.

## Risks / Trade-offs

- [The status bar and waveform re-render every frame for up to about 0.5 s] → Rendering already handles continuous wheel zoom at this rate. The glide is short and happens only on Cmd/Ctrl+click.
- [A view change that sets an identical object reference would not count as a takeover] → Every action builds a new view object through `clampView`, so this does not happen in practice.
- [Floating-point error near the ends of the path] → The final frame writes the target view itself, not `path.at(1)`.
- [The UI check depends on timing, sampling the readout each animation frame] → The check requires only a few distinct intermediate values, not exact counts, and compares the final readout with the reduced-motion jump.

No bugs or gaps outside this change were found, so there are no follow-up issue candidates.
