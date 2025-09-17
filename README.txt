Work Hours Alarm PWA
--------------------
This PWA schedules recurring alarms Sun–Thu between 10:00 and 18:00 every 20 minutes.

How to use:
1. Unzip and open index.html once in a Chromium-based browser (Chrome, Edge) or Firefox.
2. Click 'Enable & Schedule' and allow notifications.
3. Optionally install the PWA (browser may show install option).
4. Best-effort background alarms:
   - While the app is open: alarms are precise.
   - When installed: the service worker attempts to use Periodic Background Sync (if supported).
   - If periodicSync is not supported, background behavior is limited by the browser/OS.
5. If you need guaranteed OS-level alarms when the app is closed, use your phone's native alarm/clock.

Notes on reliability:
- Many browsers do NOT allow arbitrary background timers. Periodic Sync is only supported in some Chromium builds and behind flags.
- This package implements fallbacks and will notify while the page or service worker is active.
- Test by enabling and then leaving the device for a short period during the scheduled window.

Files included:
- index.html  : UI and app bootstrap
- app.js      : scheduler and registration code
- sw.js       : service worker to show notifications and handle periodicSync
- manifest.json: PWA manifest
- icon-192.png, icon-512.png : app icons
