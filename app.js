// Main app logic for scheduling recurring alarms (Sun-Thu, 10:00-18:00 every 20 minutes)
// and registering service worker + periodic sync where supported.
// Limitations: Browsers restrict background timers. This app uses best-effort:
//  - while page is open: precise timeouts
//  - when installed: registers periodic sync (if supported) to wake service worker
//  - service worker also handles missed alarms on wake
// You must grant Notification permission and install the PWA for best background behavior.

const LOG = (msg) => {
  const el = document.getElementById('log');
  const ts = new Date().toLocaleTimeString();
  el.innerText = `[${ts}] ${msg}\n` + el.innerText;
};

const scheduleKey = 'work-alarm-schedule-v1';
const RULE = {
  days: [0,1,2,3,4], // Sun=0 ... Thu=4 (we include 0..4)
  startHour: 10,
  endHour: 18,
  intervalMin: 20
};

let alarmTimeouts = [];
let registrationForSW;
let deferredPrompt;

async function init(){
  // register service worker
  if('serviceWorker' in navigator){
    try{
      registrationForSW = await navigator.serviceWorker.register('sw.js');
      LOG('Service worker registered.');
    }catch(e){
      LOG('Service worker register failed: ' + e);
    }
  } else {
    LOG('Service workers not supported in this browser.');
  }

  // install prompt handling
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    LOG('Install prompt available.');
    document.getElementById('installBtn').style.display = 'inline-block';
  });

  // UI
  document.getElementById('enableBtn').addEventListener('click', enableAlarms);
  document.getElementById('disableBtn').addEventListener('click', disableAlarms);
  document.getElementById('installBtn').addEventListener('click', async ()=>{
    if(deferredPrompt){
      deferredPrompt.prompt();
      const resp = await deferredPrompt.userChoice;
      LOG('Install choice: ' + resp.outcome);
      deferredPrompt = null;
    } else {
      LOG('Install prompt not available.');
    }
  });

  updateStatus('ready');
  restoreAndSchedule();
}

function updateStatus(text){
  document.getElementById('st-text').innerText = text;
}

// permission helpers
async function ensureNotificationPermission(){
  if(!('Notification' in window)){
    alert('Notifications are not supported in this browser.');
    return false;
  }
  if(Notification.permission === 'granted') return true;
  if(Notification.permission === 'denied'){
    alert('You have blocked notifications. Please enable from browser settings to receive background alarms.');
    return false;
  }
  const p = await Notification.requestPermission();
  return p === 'granted';
}

// generate alarms for the next N days (default 7)
function generateAlarmsForDays(days=7){
  const arr = [];
  const now = new Date();
  for(let d=0; d<days; d++){
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate()+d, 0,0,0,0);
    const dow = date.getDay();
    if(!RULE.days.includes(dow)) continue;
    // generate times from startHour to endHour inclusive start, exclusive end (so last at 17:40)
    for(let h=RULE.startHour; h<RULE.endHour; h++){
      for(let m=0; m<60; m+=RULE.intervalMin){
        const t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0,0);
        // require t between start and end bounds
        if(t.getHours() < RULE.startHour) continue;
        if(t.getHours() >= RULE.endHour) continue;
        if(t.getTime() >= Date.now()){
          arr.push(t.getTime());
        }
      }
    }
  }
  arr.sort((a,b)=>a-b);
  return arr;
}

function clearTimeouts(){
  alarmTimeouts.forEach(id => clearTimeout(id));
  alarmTimeouts = [];
}

// schedule upcoming alarms while page is open
function scheduleInPage(){
  clearTimeouts();
  const times = generateAlarmsForDays(2); // schedule for today & tomorrow
  LOG('Scheduling ' + times.length + ' upcoming alarms (page-scope).');
  times.forEach(ts => {
    const diff = ts - Date.now();
    if(diff <= 0) return;
    const id = setTimeout(()=> fireAlarm(ts), diff);
    alarmTimeouts.push(id);
  });
}

// when an alarm time arrives (in page), notify and play sound
function fireAlarm(timestamp){
  const label = new Date(timestamp).toLocaleString();
  LOG('Alarm: ' + label);
  // show notification via service worker if available (better for background)
  if(registrationForSW && registrationForSW.showNotification){
    registrationForSW.showNotification('Work Alarm', {
      body: 'Time: ' + new Date(timestamp).toLocaleTimeString(),
      tag: 'work-alarm',
      renotify: true,
      data: {timestamp}
    }).catch(e=>LOG('sw showNotification fail: '+e));
  } else {
    // fallback
    new Notification('Work Alarm', {body: 'Time: ' + new Date(timestamp).toLocaleTimeString()});
  }
  playBeep();
}

// simple beep using WebAudio
let audioCtx;
function playBeep(){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type='sine'; o.frequency.value = 880;
    g.gain.value = 0.0005;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.7);
    setTimeout(()=>{ try{o.stop();}catch(e){}; },800);
  }catch(e){
    LOG('Audio failed: '+e);
  }
}

// save state
function setEnabledFlag(val){
  localStorage.setItem(scheduleKey, JSON.stringify({enabled:!!val}));
}
function getEnabledFlag(){
  try{
    const v = JSON.parse(localStorage.getItem(scheduleKey)||'{}');
    return v.enabled === true;
  }catch(e){ return false; }
}

async function enableAlarms(){
  const ok = await ensureNotificationPermission();
  if(!ok) return;
  setEnabledFlag(true);
  updateStatus('enabled');
  scheduleInPage();
  registerPeriodicSync();
  LOG('Alarms enabled. Next few alarms scheduled in page.');
}

function disableAlarms(){
  setEnabledFlag(false);
  updateStatus('disabled');
  clearTimeouts();
  LOG('Alarms disabled.');
}

function restoreAndSchedule(){
  if(getEnabledFlag()){
    updateStatus('enabled');
    scheduleInPage();
    registerPeriodicSync();
    LOG('Restored enabled schedule from storage.');
  } else {
    updateStatus('disabled');
  }
}

// periodic sync registration (best-effort)
async function registerPeriodicSync(){
  if(!('serviceWorker' in navigator) || !registrationForSW) return;
  try{
    const swReg = await navigator.serviceWorker.ready;
    if('periodicSync' in swReg){
      // request 15-minute periodic sync (minimum is often 15)
      try{
        await swReg.periodicSync.register('work-alarm-sync', {minInterval: 15*60*1000});
        LOG('Registered periodicSync (15min). Service worker will wake periodically if supported.');
      }catch(e){
        LOG('periodicSync.register failed: ' + e);
      }
    } else {
      LOG('periodicSync not supported in this browser. Background scheduling may be limited.');
    }
  }catch(e){ LOG('registerPeriodicSync error: '+e); }
}

// listen for messages from SW (for example to show missed alarms)
navigator.serviceWorker && navigator.serviceWorker.addEventListener && navigator.serviceWorker.addEventListener('message', (ev)=>{
  if(ev.data && ev.data.type === 'fire') {
    LOG('SW requested fire for timestamp: ' + ev.data.timestamp);
    fireAlarm(ev.data.timestamp);
  }
});

init();
