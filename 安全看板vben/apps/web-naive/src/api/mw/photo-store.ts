/**
 * MOBILE-WPS-V1 · 照片二进制存储（IndexedDB，零依赖）
 *
 * 为什么不用 localStorage：
 * localStorage 约 5MB 且只存字符串，几张手机照片（即便压缩后）就会打满并抛
 * QuotaExceededError，导致**整条三违记录写不进去**。IndexedDB 存 Blob 无此问题。
 *
 * 为什么必须持久化：
 * 冻结规则要求照片**绑定三违记录ID**，不能停留在浏览器内存/组件状态里——
 * 手机切后台、来电话、微信内置浏览器回收页面都会丢。
 *
 * 兼容：无 IndexedDB 时降级到内存 Map（仅 TEST / 单页会话期内有效，会在 UI 上提示）。
 */

const DB_NAME = 'mw_hse_v1';
const DB_VERSION = 1;
const STORE = 'photos';

const memory = new Map<string, string>();
let dbPromise: Promise<IDBDatabase> | null = null;
let useMemory = false;

function hasIdb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIdb()) {
    useMemory = true;
    return Promise.reject(new Error('IndexedDB 不可用'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
  });
  return dbPromise;
}

/** 存 dataURL（key 用 storageRef） */
export async function putPhotoData(key: string, dataUrl: string): Promise<boolean> {
  if (useMemory || !hasIdb()) {
    memory.set(key, dataUrl);
    return false;
  }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('写入失败'));
      tx.onabort = () => reject(tx.error || new Error('写入中止'));
    });
    return true;
  } catch {
    useMemory = true;
    memory.set(key, dataUrl);
    return false;
  }
}

/** 取 dataURL，不存在返回空串 */
export async function getPhotoData(key: string): Promise<string> {
  if (useMemory || !hasIdb()) return memory.get(key) || '';
  try {
    const db = await openDb();
    return await new Promise<string>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
      req.onerror = () => reject(req.error || new Error('读取失败'));
    });
  } catch {
    return memory.get(key) || '';
  }
}

export async function deletePhotoData(key: string): Promise<void> {
  memory.delete(key);
  if (useMemory || !hasIdb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* 忽略：删除失败不影响主流程 */
  }
}

/** 当前是否处于内存降级模式（页面据此提示「照片仅本次会话有效」） */
export function isMemoryFallback(): boolean {
  return useMemory || !hasIdb();
}

/* ------------------------------------------------------------------ */
/* 照片压缩：手机原图动辄 5~10MB，直接塞进任何存储都不现实            */
/* ------------------------------------------------------------------ */

export interface CompressResult {
  dataUrl: string;
  width: number;
  height: number;
  /** 压缩后字节数（估算） */
  bytes: number;
}

/**
 * 把 File 压缩成 JPEG dataURL（长边上限 maxSide，质量 quality）。
 * 依赖 canvas —— 在无 canvas 的环境（Node 单测）直接原样返回 file 的 dataURL。
 */
export async function compressImage(
  file: File | Blob,
  maxSide = 1280,
  quality = 0.72,
): Promise<CompressResult> {
  const raw = await readAsDataUrl(file);
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (!doc) {
    return { dataUrl: raw, width: 0, height: 0, bytes: estimateBytes(raw) };
  }
  try {
    const img = await loadImage(doc, raw);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w || 1, h || 1));
    const tw = Math.max(1, Math.round((w || 1) * scale));
    const th = Math.max(1, Math.round((h || 1) * scale));
    const canvas = doc.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl: raw, width: w, height: h, bytes: estimateBytes(raw) };
    ctx.drawImage(img, 0, 0, tw, th);
    const out = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl: out, width: tw, height: th, bytes: estimateBytes(out) };
  } catch {
    return { dataUrl: raw, width: 0, height: 0, bytes: estimateBytes(raw) };
  }
}

async function readAsDataUrl(file: File | Blob): Promise<string> {
  const g = globalThis as unknown as { FileReader?: typeof FileReader };
  const Ctor = g.FileReader;
  if (typeof Ctor === 'function') {
    return new Promise<string>((resolve, reject) => {
      const fr = new Ctor();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error || new Error('读取文件失败'));
      fr.readAsDataURL(file);
    });
  }
  // 降级：Node / 无 FileReader 环境（单测或 Service Worker 场景）
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i] ?? 0);
  const b64 =
    typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  return `data:${file.type || 'image/jpeg'};base64,${b64}`;
}

function loadImage(doc: Document, src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = doc.createElement('img');
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

function estimateBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}
