const LOG = (msg) => {
  const el = document.getElementById("log");
  const ts = new Date().toLocaleTimeString();
  el.innerText = `[${ts}] ${msg}\n` + el.innerText;
};

let alarmTimeouts = [];
let registrationForSW;
let deferredPrompt;

const SETTINGS_KEY = "work-alarm-settings-v1";

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
  const dayEls = document.querySelectorAll(".day");
  const days = [];
  dayEls.forEach((d) => {
    if (d.checked) days.push(parseInt(d.value));
  });
  const settings = { startHour, endHour, intervalMin, days, enabled: true };
  saveSettings(settings);
  return settings;
}

async function init() {
  if ("serviceWorker" in navigator) {
    try {
      registrationForSW = await navigator.serviceWorker.register("sw.js");
      LOG("Service worker registered.");
    } catch (e) {
      LOG("Service worker register failed: " + e);
    }
  } else LOG("Service workers not supported.");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    LOG("Install prompt available.");
    document.getElementById("installBtn").style.display = "inline-block";
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

function updateStatus(text) {
  document.getElementById("st-text").innerText = text;
}

async function ensureNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Notifications not supported");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    alert("Enable notifications from browser");
    return false;
  }
  const p = await Notification.requestPermission();
  return p === "granted";
}

function clearTimeouts() {
  alarmTimeouts.forEach((id) => clearTimeout(id));
  alarmTimeouts = [];
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
    for (let h = settings.startHour; h < settings.endHour; h++) {
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
  }
  arr.sort((a, b) => a - b);
  return arr;
}

function scheduleInPage(settings) {
  clearTimeouts();
  const times = generateAlarms(settings);
  LOG("Scheduling " + times.length + " upcoming alarms (page-scope).");
  times.forEach((ts) => {
    const diff = ts - Date.now();
    if (diff <= 0) return;
    const id = setTimeout(() => fireAlarm(ts), diff);
    alarmTimeouts.push(id);
  });
}

function fireAlarm(timestamp) {
  const label = new Date(timestamp).toLocaleTimeString();
  LOG("Alarm: " + label);
  if (registrationForSW && registrationForSW.showNotification) {
    registrationForSW
      .showNotification("Work Alarm", {
        body: "Time: " + label,
        tag: "work-alarm",
        renotify: true,
        data: { timestamp },
      })
      .catch((e) => LOG("sw showNotification fail: " + e));
  } else new Notification("Work Alarm", { body: "Time: " + label });
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
    g.gain.value = 0.0005;
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
function getEnabledFlag() {
  const s = loadSettings();
  return s.enabled === true;
}

async function enableAlarms() {
  const ok = await ensureNotificationPermission();
  if (!ok) return;
  const settings = getCurrentSettings();
  setEnabledFlag(true);
  updateStatus("enabled");
  scheduleInPage(settings);
  LOG("Alarms enabled. Next few alarms scheduled in page.");
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
    LOG("Restored enabled schedule from storage.");
  } else updateStatus("disabled");
}

init();
