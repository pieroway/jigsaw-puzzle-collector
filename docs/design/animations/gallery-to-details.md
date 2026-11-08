# Gallery → Details Transition

- **Default:** 550 ms; selected card hero expands toward details hero while content crossfades.
- **Reverse:** 430 ms; return to same gallery scroll position and filters.
- **Reduce Motion:** System / On / Off. On (or System with OS preference) disables spatial transform and uses 120 ms opacity change.
- **Keyboard:** Enter/Space opens focused card; Escape or Back closes.
- **Testing:** verify navigation at each preference, no inaccessible offscreen controls, no loss of scroll/filter state.

Current starter implements a lightweight FLIP-like overlay, not a full navigation framework. This can be upgraded to Motion shared-layout animation after validation.
