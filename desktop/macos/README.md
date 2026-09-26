# UNC’sWay for macOS

Self-contained Apple Silicon application, macOS 12+. Uses the project's public
HTML/JS inside WebKit. No Node server or development checkout is needed at runtime.
The calendar uses the same upstream feed as the web project, with a bundled,
explicitly marked stale snapshot when offline. External links open in the browser.

Build with `python3 scripts/build-macos.py` (Apple Command Line Tools required).
The result is `dist/UNCsWay.app`; copy it to `~/Applications` and double-click.
Rebuild after changing the web UI; the installed app contains a snapshot of assets.
Or run `python3 scripts/build-macos.py --install` to install it automatically.
The installer keeps the previous version as a hidden backup in `~/Applications`.

Version 1.1 applies Q2/Q3 → Q1 or Q3 to the LOW/HIGH annotations. Existing
Q1/Q4 and Friday mappings remain. Only Monday–Friday weeks within one month
receive probability annotations; news and holidays do not exclude windows.
Rule checks: `node scripts/test-cycle-rules.cjs`.

Version 1.1.1 extends probability annotations through MICRO and NANO. LTF
windows use exact nano boundaries (5 min 37.5 s), so Q4/Q4/Q4 appears at the
end of each six-hour session. Select LTF in either windows panel; gold outlines
mark matching probability windows across 90MIN, MICRO and NANO. Tooltips and
the list show start/end times in ET, including half seconds. The full-week
filter and Q2/Q3 → Q1 or Q3 rule still apply.

Version 1.2 adds a bottom session panel for Asia, London, NY AM and NY PM.
It intersects exact LTF probability chains with the DAILY → 90MIN session rule.
The selected trading day spans 18:00 ET on the previous date to 18:00 ET;
date controls cover the displayed week. Each eligible session has two windows:
Q1/Q1/Q1 plus Q4/Q4/Q4 for Asia/NY PM or Q3/Q3/Q3 for London/NY AM.
These are timing windows from the configured rules, not observed price extrema.

Version 1.3 renames the panel to “High Probability Okna w Sesji” and adds an
“Dodaj do kalendarza” button to each window. The native app opens a single-event
ICS file in Apple Calendar; the user selects a calendar and confirms the import.
Browser builds download the same file. No calendar access permission is needed.
Files are kept in `~/Library/Application Support/UNCsWay/CalendarExports`.
Event dates use the New York offset on that date and export UTC instants. ICS
uses whole seconds, so fractional boundaries round outward; the description
retains the exact ET times. Stable event UIDs identify repeated exports.
Export tests: `node scripts/test-calendar-export.cjs`.

Version 1.4 adds a Sesja / Dzień switch, preserving the selected trading date.
Day mode intersects DAILY/90MIN/MICRO chains with the WEEKLY → DAILY rule and
both lower probability rules. Its windows last 22 min 30 s: Q1/Q1/Q1 plus
Q3/Q3/Q3 on Tuesday/Wednesday, or Q4/Q4/Q4 on Monday/Thursday/Friday.
Full-week and weekend filters apply. Day events export with the correct duration,
chain labels and separate UIDs so they cannot collide with session events.

Version 1.5 adds a separate bottom history panel with its own Sesja / Dzień
switch and trading-date controls. It uses the same windows and filters, includes
only windows whose end is at or before the current ET time, and offers no
calendar buttons. Changing its date or scope does not affect the upper panel.
Smoke tests cover exact end boundaries, active/future exclusion, both history
views and independent controls.

Version 1.6 adds the bottom “Aktywne SSMT” panel. Monthly, Weekly, Daily,
Session and 90 are independent checkboxes that reveal their configured
“Oczekuj 2S” guidance. Unchecking hides only that level's message. Selections
are manual and start unchecked on a fresh page load.

Version 1.7 moves the economic calendar into the Wydarzenia view beside
Timeline. Timeline returns to the home view; the calendar is not shown there.
Fragment navigation (`#timeline` / `#events`) supports direct links and history,
and switching views retains SSMT selections and panel state. The shared calendar
feed still updates holiday annotations on the timeline in the background.
The native smoke test uses a fixed weekday clock so it also runs on weekends;
it checks view navigation, weekly calendar rows and preserved SSMT state.

Version 1.7.1 places “Aktywne SSMT” first on the Timeline home page,
directly below the navigation bar, ahead of the timeline and probability panels.

Smoke test: run `dist/UNCsWay.app/Contents/MacOS/UNCsWay --self-test --offline`.
Checks the timeline, clock, offline calendar, all four daily Q4/Q4/Q4 windows,
exact boundaries, probability filters and NANO visibility in WebKit.
The session checks cover intersections, midnight/trading-day boundaries, date
navigation, Friday inclusion, weekend exclusion and mixed-month week exclusion.
The calendar test exercises the button handler, native bridge and file output;
day tests cover all weekdays, exact boundaries and toggling without date loss.
it does not open Calendar or create calendar entries during self-tests.
Writes a screenshot to `/tmp/qs-macos-preview.png`, then exits with a status code.

This is a locally ad-hoc signed build for personal use, not a notarized release.
