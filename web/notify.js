// 알리기: 서버 없이, 앱을 열 때와 내 자리가 바뀔 때 확인해서 알린다.
// 알림(Notification)을 쓸 수 있는 폰에서는 서비스 워커로 알림을 띄우고, 못 쓰는 폰에서는 화면의 띠로 같은 내용을 보인다.
// 한계: 앱이 닫혀 있을 때 정해진 시각에 알리지는 못한다(푸시 서버가 없다). 그래서 아침 알림은 그날 앱을 처음 열 때 뜬다.

import { load, save, getEvents, getInterests, getProfile, getWhere } from './store.js';
import { dayKeyOf } from './days.js';
import { cardsNeeded, dateOf, fresh, nearMarks, notifyState, shouldAskPaper, soonEvents, vegasNow } from './alerts.js';

export const getPaper = () => load('paper.v1', null);
export const setPaper = (paper) => save('paper.v1', paper);
export const getMarks = () => load('eventBooths.v1', {});
export function setMarks(marks) {
  const ok = save('eventBooths.v1', marks);
  // 표시가 바뀌면 오늘 필요한 명함 수와 가까운 부스를 다시 센다.
  checkAlerts();
  return ok;
}

// 지금 화면에 띠로 보일 것. { paper, needs, near, state, fallback, error }
export const alerts = { paper: null, needs: [], near: [], soon: [], state: 'unsupported', fallback: false, error: '' };
// 일정(세션 포함)이 시작하기 몇 분 전부터 알리나.
export const SOON_MIN = 30;
const changed = () => window.dispatchEvent(new Event('ces-alerts'));

export async function askPermission() {
  if (notifyState() === 'unsupported') return 'unsupported';
  try { await Notification.requestPermission(); } catch { /* 옛 브라우저는 약속을 돌려주지 않는다 */ }
  alerts.state = notifyState();
  changed();
  return alerts.state;
}

// 알림을 띄운다. 띄웠으면 true. 권한이 없거나 못 쓰는 폰이면 false (그때는 화면의 띠가 대신한다).
export async function notify(title, body, tag, hash) {
  if (notifyState() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag, icon: 'icon/icon-192.png', badge: 'icon/icon-192.png', data: { hash } });
    return true;
  } catch {
    return false;
  }
}

let data = null;
async function exhibitors() {
  if (!data) {
    const { getExhibitors, getInfo } = await import('./data.js');
    const [ex, info] = await Promise.all([getExhibitors(), getInfo()]);
    data = { byId: new Map(ex.ex.map((r) => [r[0], r])), info };
  }
  return data;
}

// 확인한다: 종이 명함을 물을 때인지, 오늘 동선에 명함 이벤트 부스가 있는지, 내 자리 가까이에 있는지.
// 전시사 자료는 표시한 부스가 있을 때만 읽는다 (첫 화면을 무겁게 하지 않으려고).
async function checkAlertsNow() {
  const today = dateOf(new Date());
  const marks = getMarks();
  const sent = load('alerts.v1', {});
  alerts.state = notifyState();
  alerts.fallback = false;
  alerts.error = '';
  alerts.paper = getProfile() ? shouldAskPaper(getPaper(), today) : null;
  alerts.needs = [];
  alerts.near = [];
  // 곧 시작하는 내 일정(세션 포함): 앱이 열려 있거나 화면으로 돌아왔을 때 확인한다. 라스베이거스 시각으로 견준다.
  alerts.soon = soonEvents(getEvents(), vegasNow(new Date()), SOON_MIN);
  for (const e of alerts.soon) {
    if (!fresh(sent, `soon:${e.id}`, today)) continue;
    const where = e.place ? ` · ${e.place}` : '';
    if (await notify(`${e.inMin}분 뒤 시작: ${e.name}`, `${e.from} ~ ${e.to} (라스베이거스 시각)${where}`, `ces-soon-${e.id}`, '#/days')) {
      sent[`soon:${e.id}`] = today;
      if (!save('alerts.v1', sent)) { alerts.fallback = true; alerts.error = '알림은 보냈지만 되풀이 방지 기록을 이 폰에 저장하지 못했다.'; }
    } else if (alerts.state === 'granted') {
      alerts.fallback = true;
      alerts.error = '알림을 띄우지 못해 화면의 띠로 알린다.';
    }
  }
  if (Object.keys(marks).length) {
    try {
      const { byId, info } = await exhibitors();
      const dayOfDate = (date) => dayKeyOf(info, date);
      alerts.needs = cardsNeeded(getInterests(), marks, today, dayOfDate, (id) => byId.get(id)?.[7]).map((n) => ({ ...n, name: byId.get(n.id)?.[1] || '회사' }));
      alerts.near = nearMarks(getWhere(), marks);
      const noPaper = getPaper()?.has === false;
      const tail = noPaper ? ' 종이 명함이 없으면 앱의 QR 명함을 보여 준다.' : '';
      if (alerts.needs.length && fresh(sent, 'morning', today)) {
        const names = alerts.needs.slice(0, 3).map((n) => n.name).join(' · ') + (alerts.needs.length > 3 ? ' …' : '');
        if (await notify(`오늘 명함 ${alerts.needs.length}장 필요`, `오늘 갈 곳에 명함 넣는 이벤트 부스가 있다: ${names}.${tail}`, 'ces-cards-today', noPaper ? '#/card' : '#/plan')) {
          sent.morning = today;
          if (!save('alerts.v1', sent)) {
            alerts.fallback = true;
            alerts.error = '알림은 보냈지만 되풀이 방지 기록을 이 폰에 저장하지 못했다.';
          }
        } else if (alerts.state === 'granted') {
          alerts.fallback = true;
          alerts.error = '알림을 띄우지 못해 화면의 띠로 알린다.';
        }
      }
      for (const key of alerts.near) {
        if (!fresh(sent, `near:${key}`, today)) continue;
        if (await notify('명함 넣는 이벤트 부스', `가까이에 있다: 부스 ${key.slice(key.indexOf('|') + 1)} (사람이 표시한 것, 자리는 짐작).${tail}`, `ces-near-${key}`, noPaper ? '#/card' : '#/map')) {
          sent[`near:${key}`] = today;
          if (!save('alerts.v1', sent)) {
            alerts.fallback = true;
            alerts.error = '알림은 보냈지만 되풀이 방지 기록을 이 폰에 저장하지 못했다.';
          }
        } else if (alerts.state === 'granted') {
          alerts.fallback = true;
          alerts.error = '알림을 띄우지 못해 화면의 띠로 알린다.';
        }
      }
    } catch {
      alerts.fallback = true;
      alerts.error = '이벤트 알림 자료를 읽지 못했다. 연결이나 받은 자료를 확인한다.';
    }
  }
  changed();
  return alerts;
}

let checking = null;
export function checkAlerts() {
  if (!checking) checking = checkAlertsNow().finally(() => { checking = null; });
  return checking;
}

// 열 때 · 화면으로 돌아올 때 · 내 자리가 바뀔 때 · 표시가 바뀔 때 확인한다.
let wired = false;
// 처음 부를 때만 건다. 걸었으면 true (그때 한 번 확인한다).
export function startAlerts() {
  if (wired) return false;
  wired = true;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAlerts(); });
  window.addEventListener('pageshow', () => checkAlerts());
  window.addEventListener('ces-where', () => checkAlerts());
  // 앱이 열려 있는 동안 1분마다 곧 시작하는 일정이 있는지 본다 (내 일정이 있을 때만). 닫혀 있을 때는 못 한다.
  setInterval(() => { if (!document.hidden && getEvents().length) checkAlerts(); }, 60000);
  checkAlerts();
  return true;
}
