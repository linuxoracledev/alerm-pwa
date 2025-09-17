// Service worker: handles periodic sync and shows notifications for alarm times.
// On periodic sync, it computes alarms that should have fired during the last window
// and shows notifications for them. This is best-effort and relies on browser support.

self.addEventListener('install', (ev) => {
  self.skipWaiting();
});

self.addEventListener('activate', (ev) => {
  clients.claim();
});

// helper: compute upcoming/past alarms given same RULE as page.
// We duplicate rule here; keep in sync with app.js
const RULE = {
  days: [0,1,2,3,4],
  startHour: 10,
  endHour: 18,
  intervalMin: 20
};

function generateTimestampsForRange(startMs, endMs){
  const result = [];
  const start = new Date(startMs);
  const end = new Date(endMs);
  // iterate day by day
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0,0,0,0);
  while(cur.getTime() <= end.getTime()){
    const dow = cur.getDay();
    if(RULE.days.includes(dow)){
      for(let h=RULE.startHour; h<RULE.endHour; h++){
        for(let m=0; m<60; m+=RULE.intervalMin){
          const t = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), h, m, 0,0);
          if(t.getTime() >= startMs && t.getTime() <= endMs){
            result.push(t.getTime());
          }
        }
      }
    }
    cur.setDate(cur.getDate()+1);
  }
  return result;
}

self.addEventListener('periodicsync', (ev) => {
  if(ev.tag === 'work-alarm-sync'){
    ev.waitUntil(handlePeriodicSync());
  }
});

async function handlePeriodicSync(){
  // compute window: last 20 minutes -> now
  const now = Date.now();
  const lookback = 20*60*1000;
  const start = now - lookback;
  const timestamps = generateTimestampsForRange(start, now + 5*1000); // small buffer
  if(timestamps.length === 0){
    return;
  }
  for(const ts of timestamps){
    await self.registration.showNotification('Work Alarm', {
      body: 'Time: ' + new Date(ts).toLocaleTimeString(),
      tag: 'work-alarm',
      renotify: true,
      data: {timestamp: ts}
    });
  }
}

// fallback: respond to messages from page to show notification immediately
self.addEventListener('message', (ev) => {
  try{
    const d = ev.data || {};
    if(d && d.type === 'show' && d.timestamp){
      self.registration.showNotification('Work Alarm', {
        body: 'Time: ' + new Date(d.timestamp).toLocaleTimeString(),
        tag: 'work-alarm',
        renotify: true,
        data: {timestamp: d.timestamp}
      });
    }
  }catch(e){}
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  // focus or open the app
  ev.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(clientList => {
    if(clientList.length > 0){
      const client = clientList[0];
      return client.focus();
    }
    return clients.openWindow('/');
  }));
});
