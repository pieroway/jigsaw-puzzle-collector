# Full-height collection backgrounds

Two coordinated light and dark backgrounds, with puzzle pieces near the top and open space for overlaid UI content.

## Assets
- `collection-background-light.png` / `.webp`
- `collection-background-dark.png` / `.webp`

## Suggested implementation
Use the WebP files as background images on the full-page collection view. Set `background-size: cover; background-position: center top; background-repeat: no-repeat; min-height: 100dvh;`. The background may crop on different aspect ratios, so test on mobile and desktop. Keep the content readable with surface cards or overlays and do not bake text into the image. Prefer a CSS background colour fallback matching each theme.

These are AI-generated visual assets, not an exact extraction of the reference mockup.
