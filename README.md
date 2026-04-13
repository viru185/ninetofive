# NineToFive

NineToFive is an AMOLED-dark, single-day attendance checker that feels fast, smart, and friendly. Paste a day’s punches, and the app instantly tells you how much you have worked, how much break time you’ve used, how much is left, and when you can expect to clock out — plus it remembers each day automatically in your browser.

## Features
- Built strictly for **one workday** at a time; extra dates are ignored with a polite warning.
- Large paste surface with one-click Paste, Sample Data, auto-recalculation on every edit, and a compact output panel.
- Exact totals for work and break time, including the remaining or extra minutes with playful nudges (yes, “God is watching” when breaks run long).
- Ongoing-shift handling that projects the expected OUT time (targeting 8h work + 1h break) while still counting your actual progress to the current moment.
- Chips and summary rows instead of bulky panels so the most important info stays front and center.
- Timeline of punches plus a copy-ready summary snippet for quick chats or tickets.
- **Browser history**: every parsed day is saved by date in `localStorage` (cookies optional), and you can reopen it instantly from the Saved Days dropdown. Re-pasting the same date simply updates the saved record.

## Getting Started
1. Clone or download this repository.
2. Open `index.html` directly in a modern browser *or* serve the folder with any static server (`npx serve .`).
3. Paste a single day of logs and watch the dashboard update in real time.

## Usage Flow
1. Paste punch lines (or tap **Paste** / **Sample Data**).
2. The analyzer parses only the first date it finds, calculates totals, and stores the day automatically.
3. Use the **Saved days** dropdown to reopen past entries stored in your browser.
4. Copy the summary if you need to send an update, or clear to start over.

## Input Format
- One punch per line containing a date (`10-Apr-26` or `10/Apr/2026`), a time (`09:02 AM`, `17:40`, etc.), and a keyword `In` or `Out` (case-insensitive).
- Extra columns like IP or machine IDs are ignored.
- Blank lines are skipped; malformed rows appear as warning chips.
- If you paste multiple dates, only the first date remains and a reminder chip appears.

## Calculation Rules & Logic
- Entries are sorted chronologically and paired `In → Out`. If an `Out` is missing, the shift becomes “in progress” rather than an error.
- **Work time target**: 8 hours. If you’re short, the UI shows the exact minutes left and reminds you to apply for swipe correction in the SpineHR portal. If you go beyond 8 hours, it congratulates you and shows how much extra time you delivered.
- **Break target**: 60 minutes. You’ll see “Break left: X” or “Extra break: Y” with a lighthearted warning for overindulgence. Under-running your break triggers a “you worked a little extra” message.
- **Expected OUT time**: for an ongoing shift, the app projects the completion time by adding 9 hours (8 work + 1 break) to the first unmatched `In`. Actual worked totals still use the current moment so you can see progress.
- Overlapping entries, consecutive `In`s, and lonely `Out`s don’t break the flow — they’re simply flagged via chips.

## Browser History
- Every successful parse is saved in `localStorage` under its date key. Selecting that date from the dropdown rehydrates the raw log so you can review or tweak it.
- Saving the same date again overwrites the stored copy with the latest pasted text.
- Because this uses browser storage, the history stays on the same device/browser and clears if you wipe site data.

## Ongoing Shifts
- When the latest punch is `In` without a corresponding `Out`, NineToFive:
  - Treats the shift as **in progress**.
  - Continues counting work time up to “now”.
  - Shows an expected completion time (first `In` + 9h) inside the summary row, so you know when the shift *should* end.
  - Keeps the punch timeline visible, with an extra “Expected OUT” marker.

## Edge Cases Handled
- Inconsistent spacing, duplicate columns, or blank lines.
- Consecutive `In` entries (older `In` is closed immediately with a warning).
- `Out` entries without a prior `In` (skipped + warning).
- Attempts to paste multiple dates (only the first date survives).

## Future Ideas
- Optional export of the summary as CSV/JSON for attachment to HR portals.
- Configurable shift length (for teams with non-9h schedules).
- SpineHR API hooks for pushing swipe corrections automatically.

---
Questions or ideas? Open an issue and let’s make daily attendance even smoother.
