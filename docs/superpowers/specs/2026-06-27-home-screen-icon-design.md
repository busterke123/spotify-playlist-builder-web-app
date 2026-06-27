# Home Screen Icon Design

## Goal

Replace the iPhone-generated home screen tile with a deliberate app icon that feels like a utility tool rather than a music brand clone.

## Current State

The app currently has no explicit icon metadata in [`index.html`](/Users/arne.driesen/Projects/SpotifyPlaylistBuilder/spotify-playlist-builder-web-app/index.html). It does not declare an `apple-touch-icon`, favicon set, or web manifest. iOS therefore falls back to an auto-generated tile, which currently appears as a white `S` on a black background.

## Approved Direction

Use a utility-first, slightly playful icon built from two parts:

- A rounded teal tile as the base
- A simple playlist-stack symbol with a loop-arrow badge

The icon should communicate "playlist tool" first and "rebuild action" second.

## Visual Design

### Base Tile

- Shape: rounded square
- Style: flat or near-flat, with a subtle gradient only if it improves depth without adding noise
- Primary color: teal in the `#0F766E` to `#14B8A6` range

### Primary Symbol

- Three thick horizontal bars
- Off-white foreground instead of pure white
- Rounded ends
- Strong spacing between bars
- No letters or text

This symbol must remain readable at small sizes and should carry the design even if the badge becomes visually secondary.

### Badge

- Position: lower-right corner
- Shape: small circular badge
- Accent color: warm amber, around `#F59E0B`
- Symbol: a single geometric loop arrow inspired by the referenced Noun Project icon style, but redrawn as an original asset

The badge should read as one clear loop or refresh mark. It should not use double arrows, tiny details, or hand-drawn curves. If the arrow cannot be made crisp at small sizes, the fallback is to simplify the arrow further rather than grow the badge.

## Constraints

- Do not use the exact Noun Project asset unless licensing and attribution are handled explicitly outside this scope.
- Create an original loop-arrow drawing inspired by the reference style.
- Keep the app browser-only and static. No runtime or product changes beyond icon metadata and assets.
- Prefer a small asset set that covers iPhone home screen use cleanly.

## Asset Plan

Add the minimum icon assets needed for reliable browser and iPhone presentation:

- `apple-touch-icon.png` at `180x180`
- Standard favicon assets
- A small web manifest with matching icons, if needed for broader platform consistency

The icon family should share one visual system rather than separate platform-specific designs.

## HTML And Metadata Plan

Update [`index.html`](/Users/arne.driesen/Projects/SpotifyPlaylistBuilder/spotify-playlist-builder-web-app/index.html) to declare:

- `apple-touch-icon`
- favicon links
- manifest link if a manifest is added
- theme color that matches the final icon palette

The app title can stay unchanged. The main issue is missing icon metadata, not naming.

## Acceptance Criteria

- Saving the site to an iPhone home screen uses the shipped icon instead of the generated `S` tile.
- The icon reads clearly at small size.
- The icon feels like a practical playlist tool with a light playful accent.
- The loop-arrow badge looks intentional and geometric, not awkward or cramped.
- All changes remain static-site compatible with the existing Vite setup.

## Risks

- The badge may still feel crowded at small sizes if the loop-arrow shape is too detailed.
- iOS home screen caching may make icon updates appear stale until the saved shortcut is removed and added again.
- A technically correct icon can still feel visually off if the badge dominates the stack symbol.

## Mitigations

- Keep the stack symbol dominant.
- Simplify the loop arrow aggressively.
- Verify the exported asset at real icon sizes before treating the design as done.
- Re-add the home screen shortcut during validation to avoid stale-cache confusion.

## Out Of Scope

- Rebranding the full app UI
- Changing app behavior or navigation
- Adding a backend, new runtime capability, or non-static packaging
- Building a full design system around the icon

## Implementation Notes

The implementation should prefer simple, maintainable assets and explicit metadata over clever generation steps. If the icon is authored as SVG first, export stable PNG deliverables for iPhone use.
