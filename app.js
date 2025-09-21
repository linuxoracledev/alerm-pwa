const LOG = (msg) => {
  const el = document.getElementById("log");
  const ts = new Date().toLocaleTimeString();
  el.innerText = `[${ts}] ${msg}\n` + el.innerText;
};

let alarmTimeouts = [];
let registrationForSW;
let deferredPrompt;
const SETTINGS_KEY = "work-alarm-settings-v2";

let nextAlarmTime = null;
let countdownInterval = null;

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function getCurrentSettings() {
  const startHour = parseInt(document.getElementById("startHour").value);
  const endHour = parseInt(document.getElementById("endHour").value);
  const intervalMin = parseInt(document.getElementById("interval").value);
  const days = Array.from(document.querySelectorAll(".day"))
    .filter((d) => d.checked)
    .map((d) => parseInt(d.value));
  const settings = { startHour, endHour, intervalMin, days, enabled: true };
  saveSettings(settings);
  return settings;
}

function updateStatus(text) {
  document.getElementById("st-text").innerText = text;
}
function clearTimeouts() {
  alarmTimeouts.forEach((id) => clearTimeout(id));
  alarmTimeouts = [];
}

function showModal(msg) {
  const modal = document.getElementById("alarmModal");
  document.getElementById("alarmText").innerText = msg;
  modal.style.display = "flex";
}
function closeModal() {
  document.getElementById("alarmModal").style.display = "none";
}

function generateAlarms(settings, daysAhead = 2) {
  const arr = [];
  const now = new Date();
  for (let d = 0; d < daysAhead; d++) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + d,
      0,
      0,
      0,
      0
    );
    if (!settings.days.includes(date.getDay())) continue;
    for (let h = settings.startHour; h < settings.endHour; h++)
      for (let m = 0; m < 60; m += settings.intervalMin) {
        const t = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          h,
          m,
          0,
          0
        );
        if (t.getTime() >= Date.now()) arr.push(t.getTime());
      }
  }
  return arr.sort((a, b) => a - b);
}

function scheduleInPage(settings) {
  clearTimeouts();
  const times = generateAlarms(settings);
  LOG("Scheduling " + times.length + " alarms.");
  if (times.length > 0) {
    nextAlarmTime = times[0];
    startCountdown();
  }
  times.forEach((ts) => {
    const diff = ts - Date.now();
    if (diff <= 0) return;
    const id = setTimeout(() => fireAlarm(ts), diff);
    alarmTimeouts.push(id);
  });
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    if (!nextAlarmTime) {
      document.getElementById("countdown").innerText = "--:--";
      return;
    }
    let diff = nextAlarmTime - Date.now();
    if (diff <= 0) {
      document.getElementById("countdown").innerText = "Now!";
      return;
    }
    let mins = Math.floor(diff / 60000);
    let secs = Math.floor((diff % 60000) / 1000);
    document.getElementById("countdown").innerText =
      String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }, 1000);
}

function fireAlarm(ts) {
  const label = new Date(ts).toLocaleTimeString();
  LOG("Alarm: " + label);
  showModal("Time to rest your eyes 👀\nLook 20 feet away for 20 seconds");

  // update next alarm
  const settings = loadSettings();
  const future = generateAlarms(settings);
  const next = future.find((t) => t > Date.now());
  nextAlarmTime = next || null;

  if (registrationForSW && registrationForSW.showNotification) {
    registrationForSW
      .showNotification("20-20-20 Reminder", {
        body: "Look 20ft away for 20s 👀",
        tag: "eye-care",
        renotify: true,
        data: { ts },
      })
      .catch((e) => LOG("sw showNotification fail: " + e));
  } else if (
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    new Notification("20-20-20 Reminder", {
      body: "Look 20ft away for 20s 👀",
    });
  }
  playBeep();
}

let audioCtx;
function playBeep() {
  try {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.001;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.7);
    setTimeout(() => {
      try {
        o.stop();
      } catch (e) {}
    }, 800);
  } catch (e) {
    LOG("Audio failed: " + e);
  }
}

function setEnabledFlag(val) {
  const s = loadSettings();
  s.enabled = !!val;
  saveSettings(s);
}
async function ensureNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Notifications not supported");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    alert("Enable notifications in browser");
    return false;
  }
  const p = await Notification.requestPermission();
  return p === "granted";
}

async function enableAlarms() {
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const settings = getCurrentSettings();
  setEnabledFlag(true);
  updateStatus("enabled");
  scheduleInPage(settings);
  LOG("Alarms enabled.");
}

function disableAlarms() {
  setEnabledFlag(false);
  updateStatus("disabled");
  clearTimeouts();
  LOG("Alarms disabled.");
}

function restoreAndSchedule() {
  const s = loadSettings();
  if (s.startHour !== undefined)
    document.getElementById("startHour").value = s.startHour;
  if (s.endHour !== undefined)
    document.getElementById("endHour").value = s.endHour;
  if (s.intervalMin !== undefined)
    document.getElementById("interval").value = s.intervalMin;
  if (s.days)
    document
      .querySelectorAll(".day")
      .forEach((d) => (d.checked = s.days.includes(parseInt(d.value))));
  if (s.enabled) {
    updateStatus("enabled");
    scheduleInPage(s);
    LOG("Restored schedule from storage.");
  } else updateStatus("disabled");
}

async function init() {
  if ("serviceWorker" in navigator) {
    try {
      registrationForSW = await navigator.serviceWorker.register("sw.js");
      LOG("Service worker registered.");
    } catch (e) {
      LOG("Service worker register failed: " + e);
    }
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById("installBtn").style.display = "inline-block";
    LOG("Install prompt available.");
  });

  document.getElementById("enableBtn").addEventListener("click", enableAlarms);
  document
    .getElementById("disableBtn")
    .addEventListener("click", disableAlarms);
  document.getElementById("installBtn").addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const resp = await deferredPrompt.userChoice;
      LOG("Install choice: " + resp.outcome);
      deferredPrompt = null;
    }
  });

  restoreAndSchedule();
}

init();
