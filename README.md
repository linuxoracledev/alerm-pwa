# alerm-pwa
A simple **Progressive Web App (PWA)** alarm clock that runs in your browser or can be installed as a standalone app.   It plays a sound and shows notifications **every 20 minutes between 10:00 AM and 6:00 PM, Sunday–Thursday** — useful for work/break reminders, productivity cycles, or hydration alerts.
---

## ✨ Features
- Installable as a PWA on desktop and mobile (Add to Home Screen).
- Works offline after first load.
- Automatic recurring alarms:
  - **Days:** Sunday → Thursday  
  - **Time range:** 10:00 – 18:00  
  - **Interval:** Every 20 minutes  
- Plays a short beep/chime + browser notification.
- Minimal UI, no external dependencies.

---

## 📦 Project Structure
pwa-alarm/
│── index.html # Main UI
│── app.js # Alarm scheduling logic
│── sw.js # Service Worker for notifications
│── manifest.json # PWA manifest
│── icon-192.png # PWA app icon
│── icon-512.png # PWA app icon
│── README.md # Project info
