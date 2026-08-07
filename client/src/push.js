// Web Push 订阅管理:注册 SW → 获取公钥 → 订阅 → 上报服务端
import { http } from './api/http.js';

let inited = false;

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/**
 * 设备/浏览器统一检测(与 iOS 判断集中管理)。
 * @returns {{ ios: boolean, harmonyPhone: boolean, huaweiBrowser: boolean, standalone: boolean }}
 *   harmonyPhone  = 华为/荣耀手机(含 HarmonyOS)
 *   huaweiBrowser = 华为浏览器(Web Push 走华为 Push Kit,国内可达)
 *   standalone    = 是否已从主屏幕/桌面启动
 */
export function detectPushDevice() {
  const ua = navigator.userAgent;
  return {
    ios: isIOS(),
    harmonyPhone: /huawei|honor/i.test(ua) || /harmonyos/i.test(ua),
    huaweiBrowser: /huaweibrowser/i.test(ua),
    standalone: isStandalone(),
  };
}

/**
 * 订阅 Web Push。
 * @param {boolean} force 手动触发时传 true,绕过自动订阅缓存
 * @returns {Promise<{ok:boolean, reason?:string, message?:string}>}
 */
export async function setupPushSubscription(force = false) {
  if (inited && !force) return { ok: true, reason: 'skipped' };
  inited = true;
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-need-home' };
      return { ok: false, reason: 'unsupported' };
    }
    const { publicKey } = await http.get('/push/vapid-public-key').catch(() => ({ publicKey: '' }));
    if (!publicKey) return { ok: false, reason: 'no-vapid' };

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch (err) {
        if (isIOS() && !isStandalone()) {
          return { ok: false, reason: 'ios-need-home' };
        }
        throw err;
      }
    }
    const keys = sub.toJSON().keys;
    await http.post('/push/subscribe', { endpoint: sub.endpoint, keys });
    return { ok: true, already: !!sub };
  } catch (err) {
    console.warn('[push] 订阅失败:', err.message);
    return { ok: false, reason: 'error', message: err.message };
  }
}

/** 查询当前通知订阅状态:enabled / disabled / unsupported */
export async function getPushStatus() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return isIOS() && !isStandalone() ? 'ios-need-home' : 'unsupported';
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'enabled' : 'disabled';
  } catch {
    return 'disabled';
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
