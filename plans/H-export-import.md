# Plan H — Export / import (TIER 5)

Round-trip fidelity is the bar. `.md` and `.docx` must survive a round trip.

- **H1** `.docx` round-trip via Mammoth. *Accept:* export→import preserves headings, lists, tables, images.
- **H2** `.pdf` via paged.js — page-boundary fidelity matches editor canvas.
- **H3** `.html` standalone, embedded CSS, **no JS**.
- **H4** `.md` canonical lossless round-trip (ties F3).
- **H5** `.epub` for long-form / book.
- **H6** LaTeX for academic — equations + bibliography preserved.
- **H7** plain `.txt`.
- **H8** Bulk export: multi-select files → ZIP in chosen format.
- **H9** Import: `.docx` (Mammoth), `.md`, `.html`, Notion-zip, Google Docs (clipboard HTML parse). *FM:* malformed input → partial import with a warning, not a crash.
