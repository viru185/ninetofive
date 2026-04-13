# NineToFive

NineToFive is a lightweight, premium-feel single-page tool for auditing one workday of attendance punches. Paste the raw log, and the app instantly surfaces worked time, break totals, shift progress, and whether the day is still in progress — all in a compact AMOLED-dark dashboard.

## Features
- Purpose-built for **one day** of punch data; extra dates are ignored with a gentle warning.
- Large paste surface with one-click clipboard paste, sample data, and automatic recalculation on every edit.
- Clean summary cards for total worked time, breaks, break signal (under/over an hour), and live shift status.
- Progress indicator toward a 9-hour shift plus an at-a-glance timeline of punches, including inferred “now” outs for ongoing shifts.
- Minimal status chips highlight malformed rows or missing pairs without overwhelming the UI.
- Copy-ready daily summary for notes or chat handoffs.
- AMOLED-ready layout with subtle gradients, modern typography, and responsive behavior across desktop and mobile.

## Getting Started
1. Clone or download this repository.
2. Open `index.html` in any modern browser *or* serve the folder with a lightweight static server (e.g. `npx serve .`).
3. Start pasting logs — no build step or dependencies required.

## Usage
1. Paste punch lines into the text area (or use **Paste** for clipboard, **Sample Data** for a demo).
2. The dashboard recalculates instantly, showing metrics, shift status, and the timeline.
3. Use **Copy Summary** to drop a concise recap into email/chat if needed.
4. Hit **Clear** to reset for a new day.

## Input Format
Each punch should sit on its own line and include:
- A date token such as `10-Apr-26` or `10/Apr/2026` (the first day encountered becomes the active day).
- A time token like `09:02 AM`, `17:40`, or `17:40:30` (seconds optional).
- A direction keyword `In` or `Out` (case-insensitive).
- Extra columns/IPs/etc. are ignored.

Example:
```
10-Apr-26    09:02 AM    In    HQ-1
10-Apr-26    12:08 PM    Out   HQ-1
```

If multiple days are pasted, NineToFive keeps only the first day and surfaces a warning chip.

## Calculation Rules
- Entries are sorted chronologically and paired `In → Out`.
- Worked time per segment = `Out - In` (negative gaps are dropped and flagged).
- Breaks measure the gap between one segment’s `Out` and the next `In`.
- If the latest `In` lacks a matching `Out`, the app marks the shift as **in progress** and uses the **current time** as a temporary end. The inferred time is clearly labeled in the timeline/summary and updates whenever the user recalculates.
- Break badge logic:
  - `Break < 1 hour` when total breaks < 58 minutes.
  - `Break ≈ 1 hour` within ±2 minutes of 60 minutes.
  - `Break > 1 hour` when total breaks > 62 minutes.
- Malformed/partial lines are skipped and surfaced as compact warning chips.

## Examples & Ongoing Shifts
Use the built-in sample data for a complete day. To test an ongoing shift, paste only an `In` and partial punches; the app will:
- Label the shift “In progress”.
- Show the live inferred Out time (“now”).
- Continue to include that provisional segment in totals so you can see progress so far.

## Edge Cases Handled
- Inconsistent whitespace, extra identifiers, or blank lines.
- Consecutive `In` entries (prior shift auto-closes at the next timestamp + warning).
- Lonely `Out` entries (skipped with warning chip).
- Attempts to paste multiple days (all but the first date ignored).

## Future Ideas
- Allow configurable shift targets (currently fixed at 9h).
- Optional alerts for unusually short/long shifts.
- Quick export of the daily summary as CSV/JSON if needed.

---
Questions or improvements? Open an issue or drop feedback — always happy to iterate.
