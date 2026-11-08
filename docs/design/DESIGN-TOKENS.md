# Design Tokens

| Token | Light | Dark |
|---|---|---|
| Background | `#f8f5ef` | `#16171c` |
| Surface | `#fffdf9` | `#25262d` |
| Primary text | `#24262a` | `#f3f0eb` |
| Muted text | `#77756f` | `#b2aea7` |
| Accent | `#356be8` | `#a68aff` |
| Corner radius | 18–26 px | 18–26 px |
| Default transition | 550 ms | 550 ms |

CSS custom properties in `frontend/src/styles.css` are authoritative for the prototype. Respect system colour scheme and reduced-motion preferences.

## Typography

Use `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif` throughout the application. The `--font-ui` CSS token applies to headings, puzzle titles, collection statistics, labels, descriptions, buttons, and metadata. Apple platforms use their native system typography; other platforms follow the stack in order. Inter is used when available and when earlier fonts do not match. No font files or external font downloads are required.
