/**
 * MOBILE-WPS-V1 · 轻量中间层 HTTP 传输实现（**默认未启用**）
 *
 * ⚠️⚠️ 安全边界（务必读懂再改）：
 * WPS 开放平台用的是 `client_credentials` **应用级（租户级）凭证**。
 * 把它下发到手机浏览器 = 把整张多维表的读写权交出去，且 WPS 侧**无法**按登录用户做行级隔离。
 * ⇒ 「手机浏览器直连 WPS API」在本项目被判定为**不可行**，本实现**绝不**在前端持有
 *    WPS_APP_ID / WPS_APP_SECRET / access_token。
 *
 * 本实现的通信对象是一个「轻量中间层」：
 *     手机浏览器 --(HTTPS + 会话令牌)--> 轻量中间层 --(WPS 凭证)--> WPS 多维表
 * 中间层只做三件事：保管凭证、按会话做范围过滤、把业务模型映射成 WPS 字段。
 *
 * 启用方式：配置 `VITE_MW_API_BASE`（如 https://mw.example.com/api/mw）。
 * 未配置 ⇒ 不启用（工厂回落到本地 TEST 实现），**不会**因为缺配置而把任何密钥塞进前端。
 * 契约详见 docs/MOBILE-WPS/MIDDLEWARE-CONTRACT.md。
 */

import type {
  Area,
  MobileAccount,
  PhotoRecord,
  ReviewRecord,
  RosterEmployee,
  TransferRecord,
  ViolationBundle,
  ViolationRecord,
  ViolationRule,
} from '../core/types';
import type { MwTransport, PutPhotoInput } from './types';

export interface HttpTransportOptions {
  /** 中间层基址，如 https://mw.example.com/api/mw */
  baseUrl: string;
  /** 取会话令牌（V1 临时身份：手机号 → 令牌）。没有令牌 ⇒ 不发起请求 */
  tokenProvider?: () => string;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export class HttpTransport implements MwTransport {
  readonly kind = 'http' as const;
  readonly label = '轻量中间层（WPS）';
  readonly description =
    '经持有 WPS 凭证的轻量中间层读写 WPS 多维表。浏览器侧不持有任何 WPS 密钥。';
  readonly isTestData = false;

  private readonly baseUrl: string;
  private readonly tokenProvider?: () => string;

  constructor(opts: HttpTransportOptions) {
    this.baseUrl = opts.baseUrl;
    this.tokenProvider = opts.tokenProvider;
  }

  private async req<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    const token = this.tokenProvider?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(joinUrl(this.baseUrl, path), {
      ...init,
      headers,
    });
    if (!res.ok) {
      // 不透传中间层原始报文，避免泄露内部细节
      throw new Error(`中间层请求失败（HTTP ${res.status}）`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  /* ---------------- 主数据 ---------------- */

  listAccounts(): Promise<MobileAccount[]> {
    return this.req<MobileAccount[]>('/accounts');
  }

  listRoster(): Promise<RosterEmployee[]> {
    return this.req<RosterEmployee[]>('/roster');
  }

  listRules(): Promise<ViolationRule[]> {
    return this.req<ViolationRule[]>('/rules');
  }

  listAreas(): Promise<Area[]> {
    return this.req<Area[]>('/areas');
  }

  /* ---------------- 三违记录 ---------------- */

  nextViolationSeq(dateStr: string): Promise<number> {
    return this.req<{ seq: number }>(
      `/violations/next-seq?date=${encodeURIComponent(dateStr)}`,
    ).then((r) => r.seq);
  }

  createRecord(record: ViolationRecord): Promise<ViolationRecord> {
    return this.req<ViolationRecord>('/violations', {
      method: 'POST',
      body: JSON.stringify(record),
    });
  }

  updateRecord(record: ViolationRecord): Promise<ViolationRecord> {
    return this.req<ViolationRecord>(
      `/violations/${encodeURIComponent(record.violationId)}`,
      { method: 'PATCH', body: JSON.stringify(record) },
    );
  }

  getRecord(violationId: string): Promise<ViolationBundle | null> {
    return this.req<ViolationBundle | null>(
      `/violations/${encodeURIComponent(violationId)}`,
    );
  }

  listRecords(): Promise<ViolationRecord[]> {
    return this.req<ViolationRecord[]>('/violations');
  }

  /* ---------------- 照片 ---------------- */

  async putPhoto(input: PutPhotoInput): Promise<PhotoRecord> {
    // dataURL → Blob，避免整张 base64 走 JSON（体积 +33%）
    const blob = await (await fetch(input.dataUrl)).blob();
    const form = new FormData();
    form.append('photoType', input.photoType);
    form.append('fileName', input.fileName);
    form.append('file', blob, input.fileName || 'photo.jpg');
    const token = this.tokenProvider?.();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(
      joinUrl(this.baseUrl, `/violations/${encodeURIComponent(input.violationId)}/photos`),
      { method: 'POST', body: form, headers },
    );
    if (!res.ok) throw new Error(`照片上传失败（HTTP ${res.status}）`);
    return (await res.json()) as PhotoRecord;
  }

  listPhotos(violationId: string): Promise<PhotoRecord[]> {
    return this.req<PhotoRecord[]>(
      `/violations/${encodeURIComponent(violationId)}/photos`,
    );
  }

  /**
   * WPS 原生附件字段没有公网直链（值形如 {fileName, uploadId, source}），
   * 中间层换不出 URL 时返回空串 —— 页面必须能优雅降级（显示文件名而非破图）。
   */
  async resolvePhotoUrl(photo: PhotoRecord): Promise<string> {
    if (!photo.storageRef) return '';
    return this.req<{ url: string }>(
      `/photos/${encodeURIComponent(photo.photoId)}/url`,
    )
      .then((r) => r.url || '')
      .catch(() => '');
  }

  deletePhoto(photoId: string): Promise<void> {
    return this.req<void>(`/photos/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
    });
  }

  /* ---------------- 转派 / 复查 ---------------- */

  createTransfer(t: TransferRecord): Promise<TransferRecord> {
    return this.req<TransferRecord>('/transfers', {
      method: 'POST',
      body: JSON.stringify(t),
    });
  }

  updateTransfer(t: TransferRecord): Promise<TransferRecord> {
    return this.req<TransferRecord>(
      `/transfers/${encodeURIComponent(t.transferId)}`,
      { method: 'PATCH', body: JSON.stringify(t) },
    );
  }

  listTransfers(): Promise<TransferRecord[]> {
    return this.req<TransferRecord[]>('/transfers');
  }

  createReview(r: ReviewRecord): Promise<ReviewRecord> {
    return this.req<ReviewRecord>('/reviews', {
      method: 'POST',
      body: JSON.stringify(r),
    });
  }

  listReviews(violationId: string): Promise<ReviewRecord[]> {
    return this.req<ReviewRecord[]>(
      `/violations/${encodeURIComponent(violationId)}/reviews`,
    );
  }
}
