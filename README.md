# NineToFive

NineToFive is a compact, AMOLED-dark single-day attendance companion. Paste a day’s punch log, and the app instantly shows how much you have worked, how much break time remains, whether the shift is still open, and when you are expected to swipe out — all while remembering each day automatically in your browser.

## Highlights

- Purpose-built for one day of punches; extra dates are ignored with a friendly chip.
- One-click Paste/Sample/Clear controls plus a session-aware history dropdown aligned with the header.
- Clean dual cards for **Work** and **Break** totals with precise remaining/extra time messaging.
- Shift states (Incomplete vs. Completed) are surfaced via compact chips and a summary line.
- Expected Out time is always calculated from the **first In time + 9 hours** (8h work + 1h break). If the shift is still running, that expectation stays in view.
- Segmented progress bar renders work, break, extra work/break, and swipe-adjustment slices with hover tooltips, so every part of the shift is easy to read on the AMOLED background.
- Automatic browser storage (via `localStorage`): every parsed day is saved by its date key. Selecting the date rehydrates the raw log; re-pasting overwrites the stored record.
- Friendly nudges: swipe-correction reminders for short work days, playful “hope HR lets you live” quips for long breaks, and encouragement for extra effort.

## Usage

1. Open `index.html` in a modern browser (or serve the folder with any static server such as `npx serve .`).
2. Paste a single day of raw logs into the text area (or press **Paste** / **Sample Data**).
3. The analyzer recalculates instantly, updates the work/break cards, the progress bar, and the punch timeline, then saves the day in history.
4. Reopen prior days using the **Saved days** dropdown; the raw text is restored so you can tweak and recalc quickly.
5. Copy the summary if you need to drop the numbers into chat/email, or Clear to start fresh.

## Input Format

- One punch per line containing:
    - Date token (`10-Apr-26`, `10/Apr/2026`, etc.).
    - Time token (`09:02 AM`, `17:40`, optional seconds).
    - Direction keyword `In` / `Out` (case-insensitive).
- Extra columns/IPs/machine IDs are ignored.
- Blank or malformed lines are skipped and surfaced as warning chips.
- If multiple dates are pasted, only the first date remains.

## Calculation Rules

- All timing starts from the **first valid In**. Every expected milestone (including projected OUT) references that baseline.
- Segments: entries are sorted chronologically and paired `In → Out`. Negative gaps are discarded with warnings.
- Ongoing shifts: if the latest `In` lacks an `Out`, the shift becomes “Incomplete,” the work total keeps counting up to “now,” and the expected OUT time shows as `first In + 9h`.
- Work status logic:
    - Under 8h & incomplete → show remaining time and tell the user to keep working before swiping.
    - Under 8h & completed → tell the user to apply for **swipe correction in SpineHR** (plus a dedicated swipe note).
    - Over 8h → congratulate the user and state how much extra work was logged.
- Break status logic:
    - Under 1h & incomplete → show remaining break time and suggest taking it soon.
    - Under 1h & completed → thank the user for hustling extra.
    - Over 1h → show the exact extra break and remind the user the shift must go beyond the 9h mark (completed state adds “hope HR lets you live”).
- Expected Out: always `first In + 9h`. Displayed prominently whenever a shift is incomplete.

## Progress Bar & Status Chips

- The multi-color bar stacks work, break, extra work, extra break, and swipe-adjustment segments in order; work uses aqua accents, breaks use warm amber/orange, extras use brighter hues.
- Hover any segment to see its duration and status (“Within target”, “Over limit”, “Swipe correction”, etc.) via a dark-themed tooltip.
- Short badges under the bar show the current deltas (e.g., `Work −32m`, `Break +12m`).
- Chips at the top summarize shift state, warnings, and expected Out times without huge panels.

## Browser History

- Each parsed day is persisted locally (no backend). Selecting a saved date restores the raw log so you can revisit or adjust it.
- Saving the same date again overwrites the prior snapshot.
- Clearing browser/site data removes the stored history.

## README-friendly FAQ

- **Why no uploads?** The tool only accepts paste input to keep the workflow fast (per the requirements).
- **Why single day?** Scope is intentionally tight; multi-day grouping is explicitly out-of-scope.
- **Swipe correction?** Any completed shift that still lacks 8h of work triggers a SpineHR reminder banner so you can raise a swipe correction immediately.

## Edge Cases & Safeguards

- Inconsistent whitespace, duplicate columns, or blank lines are normalized away.
- Consecutive `In` entries close the older `In` with an inferred `Out` and a warning chip.
- Lone `Out` entries are skipped but logged as warnings.
- Extra breaks explicitly mention the need to work beyond the 9-hour expectation to recover the lost work time.

## Future Ideas

- Configurable targets for teams that operate outside the 8h/1h split.
- Optional CSV/JSON export of the day summary (still plain HTML/JS).
- Direct SpineHR integration for filing swipe corrections automatically.

Feel free to open an issue or send feedback — happy to iterate and keep your daily attendance check painless.
