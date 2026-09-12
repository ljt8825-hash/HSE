/**
 * HSE-MOBILE-GRID-02-B：移动端图片上传封装（复用既有正式上传接口）
 *
 * 契约来源（已读实际源码）：
 *   - server/routes/files.js  → POST /api/files/upload/image
 *       中间件 uploadImage.single('file')，故 FormData 字段名必须为 file；
 *       成功后返回 { filename, originalName, size, mimetype, url, path }。
 *   - server/middleware/upload.js → getFileUrl() 用 `${req.protocol}://${req.get('host')}`
 *       拼出**绝对 URL**（如 http://127.0.0.1:5881/uploads/images/xxx.jpg）。
 *   - 允许的图片类型：jpeg / png / gif / webp / bmp（另有魔术字节校验）。
 *
 * 关键约定（GRID-02-B §16/§17）：
 *   入库只允许**相对路径** `/uploads/images/<filename>`。绝对 URL、blob:、data:、
 *   本地临时路径一律不入库，否则开发/测试/生产环境无法通用解析。
 *
 * 本文件不新增任何后端接口，也不改动现有上传与静态资源机制。
 */
import { requestClient } from '#/api/request';

/** 上传接口（相对 requestClient baseURL=/api） */
const UPLOAD_IMAGE_API = '/files/upload/image';

/** 后端 uploadImage 使用的子目录（middleware/upload.js: subDir='images'） */
const UPLOAD_IMAGE_SUBDIR = 'images';

/** 对象存储子目录前缀，入库相对路径由此拼接 */
const UPLOAD_WEB_PREFIX = `/uploads/${UPLOAD_IMAGE_SUBDIR}/`;

/** 客户端软性体积上限（后端上限 512MB，此处仅用于弱网/移动流量下的友好提示） */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 后端 allowed image mimes（middleware/upload.js UPLOAD_CONFIG.types.image） */
const ALLOWED_IMAGE_MIMES = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface ImageUploadResult {
  /** 归一化后的相对 web 路径（唯一允许入库的形态） */
  webPath: string;
  /** 服务器返回的绝对 URL（仅用于本地兜底展示，不入库） */
  rawUrl: string;
  filename: string;
  size: number;
}

/**
 * 把任意形态的图片地址归一化为相对 web 路径 `/uploads/images/<filename>`。
 * - 已是 `/uploads/...` → 原样返回
 * - 绝对 URL（http/https/协议相对）→ 截取 `/uploads/...` 之后的部分
 * - 仅文件名 → 按上传接口固定目录拼装
 * 无法识别时返回空串（由调用方判为失败，绝不把脏值写库）。
 */
export function toRelativeUploadPath(raw?: null | string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return s;
  const matched = s.match(/^[a-z][\w+.-]*:\/\/[^/]+(\/uploads\/.*)$/i);
  if (matched?.[1]) return matched[1];
  // 协议相对（//host/uploads/...）
  const protoRelative = s.match(/^\/\/[^/]+(\/uploads\/.*)$/i);
  if (protoRelative?.[1]) return protoRelative[1];
  const filename = s.split(/[?#]/)[0]?.split('/').pop() ?? '';
  return filename ? `${UPLOAD_WEB_PREFIX}${filename}` : '';
}

/** 多图入库约定：以英文逗号分隔（与 PC 端 image_content 解析逻辑一致） */
export function joinImagePaths(paths: string[]): string {
  return paths
    .map((p) => toRelativeUploadPath(p))
    .filter((p) => p !== '')
    .join(',');
}

/** 拆分入库字符串为图片路径数组（仅保留可识别的相对/绝对地址，过滤占位文本） */
export function splitImagePaths(value?: null | string): string[] {
  if (!value) return [];
  const pathRe = /(\/uploads\/|^https?:\/\/|\.(?:jpe?g|png|gif|webp|bmp)(?:[?#].*)?$)/i;
  return String(value)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '' && pathRe.test(p));
}

/** 是否后端允许的图片类型（浏览器 file.type 可能为空，为空时交由后端魔术字节校验） */
export function isAllowedImageFile(file: File): boolean {
  if (!file.type) return true;
  return ALLOWED_IMAGE_MIMES.has(file.type.toLowerCase());
}

/**
 * 上传单张图片 → 返回可入库的相对路径。
 * 失败时抛出 Error（message 已是可直接展示的中文文案）。
 */
export async function uploadGridImage(file: File): Promise<ImageUploadResult> {
  if (!isAllowedImageFile(file)) {
    throw new Error('仅支持 JPG / PNG / GIF / WEBP / BMP 图片');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('图片过大（超过 20MB），请压缩后重试');
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await requestClient.post<{
    filename: string;
    mimetype: string;
    originalName: string;
    size: number;
    url: string;
  }>(UPLOAD_IMAGE_API, formData, {
    // 交由浏览器自动补 multipart boundary（与既有 import.ts 上传写法一致）
    headers: { 'Content-Type': undefined as unknown as string },
  });

  const rawUrl = String(res?.url ?? '');
  const webPath = toRelativeUploadPath(rawUrl || res?.filename);
  if (!webPath) {
    throw new Error('图片上传失败，服务端未返回有效地址');
  }
  return {
    webPath,
    rawUrl,
    filename: String(res?.filename ?? ''),
    size: Number(res?.size) || file.size,
  };
}
