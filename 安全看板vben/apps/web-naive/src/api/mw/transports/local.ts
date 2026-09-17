/**
 * MOBILE-WPS-V1 · 本地 TEST 传输实现
 *
 * 定位：**没有中间层 / 没有云服务器时也能把流程跑通并验证**。
 * 它把 WPS 的 8 张表镜像到浏览器本地（结构化数据 → localStorage，照片二进制 → IndexedDB）。
 *
 * 为什么 NODE-01 默认走它：
 * - WPS 的 client_credentials 是应用级凭证，**不能下发到浏览器**；
 * - 本阶段**不允许为了跑起来而启动云服务器/第三方服务**；
 * - 真实花名册与三违规则**尚未提供**，本实现加载的均为显式 TEST 占位数据。
 *
 * ⚠️ 因此它的数据是**单机、非共享、清缓存即丢**的，
 *    仅用于流程与规则验证，**不得**用于真实业务登记。
 *    页面顶部会常驻「TEST 数据 · 本地单机」横幅。
 *
 * 替换方式：实现同一个 MwTransport 接口（见 ./types.ts）并在 ./index.ts 工厂里切换即可，
 * 页面与业务模型零改动 —— 这就是「未来迁移适配层」的可替换性证明。
 */

import {
  TEST_ACCOUNTS,
  TEST_AREAS,
  TEST_ROSTER,
  TEST_RULES,
} from '../core/seed';
import { nextSeqOfDay, randomId } from '../core/id';
import {
  deletePhotoData,
  getPhotoData,
  putPhotoData,
} from '../photo-store';
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

const NS = 'mw_v1_';
const K = {
  accounts: `${NS}accounts`,
  roster: `${NS}roster`,
  rules: `${NS}rules`,
  areas: `${NS}areas`,
  records: `${NS}records`,
  photos: `${NS}photos`,
  transfers: `${NS}transfers`,
  reviews: `${NS}reviews`,
};

/**
 * 结构化存储的读写。
 * 有 localStorage 就用它（刷新不丢）；没有（Node 单测 / 隐私模式）则退回**实例内** Map，
 * 保证**流程可验证**，只是不做跨会话持久化。
 * 实例内 Map 的另一个好处：新建实例即得到干净数据集，便于测试隔离。
 */
const memGlobal = new Map<string, string>();

function ls(): Storage | null {
  const g = globalThis as unknown as { localStorage?: Storage };
  return g.localStorage || null;
}

function read<T>(key: string, seed: T[]): T[] {
  try {
    const s = ls();
    const raw = s ? s.getItem(key) : memGlobal.get(key) || null;
    if (raw) return JSON.parse(raw) as T[];
  } catch {
    /* 解析失败回落种子数据 */
  }
  return JSON.parse(JSON.stringify(seed)) as T[];
}

function write<T>(key: string, value: T[]): void {
  const raw = JSON.stringify(value);
  memGlobal.set(key, raw);
  try {
    const s = ls();
    if (s) s.setItem(key, raw);
  } catch {
    /* 配额溢出等：交由上层提示 */
  }
}

/** 清空本地 TEST 数据集（测试隔离 / 「重置演示数据」用） */
export function resetLocalStore(): void {
  memGlobal.clear();
  try {
    const s = ls();
    if (s) Object.values(K).forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

export class LocalTestTransport implements MwTransport {
  readonly kind = 'local' as const;
  readonly label = '本地 TEST（单机）';
  readonly description =
    '数据仅存本机浏览器（localStorage + IndexedDB），非 WPS、非共享、清缓存即丢。用于流程验证。';
  readonly isTestData = true;

  /* ---------------- 主数据 ---------------- */

  async listAccounts(): Promise<MobileAccount[]> {
    return read<MobileAccount>(K.accounts, TEST_ACCOUNTS);
  }

  async listRoster(): Promise<RosterEmployee[]> {
    return read<RosterEmployee>(K.roster, TEST_ROSTER);
  }

  async listRules(): Promise<ViolationRule[]> {
    return read<ViolationRule>(K.rules, TEST_RULES);
  }

  async listAreas(): Promise<Area[]> {
    return read<Area>(K.areas, TEST_AREAS);
  }

  /* ---------------- 三违记录 ---------------- */

  async nextViolationSeq(dateStr: string): Promise<number> {
    const all = read<ViolationRecord>(K.records, []);
    return nextSeqOfDay(all.map((r) => r.violationId), dateStr);
  }

  async createRecord(record: ViolationRecord): Promise<ViolationRecord> {
    const all = read<ViolationRecord>(K.records, []);
    if (all.some((r) => r.violationId === record.violationId)) {
      throw new Error(`三违记录ID 重复：${record.violationId}`);
    }
    const saved: ViolationRecord = {
      ...record,
      rowId: record.rowId || randomId('row'),
    };
    all.push(saved);
    write(K.records, all);
    return saved;
  }

  async updateRecord(record: ViolationRecord): Promise<ViolationRecord> {
    const all = read<ViolationRecord>(K.records, []);
    const i = all.findIndex((r) => r.violationId === record.violationId);
    if (i < 0) throw new Error(`三违记录不存在：${record.violationId}`);
    all[i] = { ...record };
    write(K.records, all);
    return all[i] as ViolationRecord;
  }

  async getRecord(violationId: string): Promise<ViolationBundle | null> {
    const all = read<ViolationRecord>(K.records, []);
    const record = all.find((r) => r.violationId === violationId);
    if (!record) return null;
    return {
      record,
      photos: (await this.listPhotos(violationId)) as PhotoRecord[],
      transfers: read<TransferRecord>(K.transfers, []).filter(
        (t) => t.violationId === violationId,
      ),
      reviews: read<ReviewRecord>(K.reviews, []).filter(
        (r) => r.violationId === violationId,
      ),
    };
  }

  async listRecords(): Promise<ViolationRecord[]> {
    return read<ViolationRecord>(K.records, []);
  }

  /* ---------------- 照片 ---------------- */

  async putPhoto(input: PutPhotoInput): Promise<PhotoRecord> {
    if (!input.violationId) {
      throw new Error('照片必须绑定三违记录ID，不允许游离存储');
    }
    const photoId = randomId('ph');
    const persisted = await putPhotoData(photoId, input.dataUrl);
    const photo: PhotoRecord = {
      photoId,
      violationId: input.violationId,
      photoType: input.photoType,
      // 本地实现：storageRef 即 IndexedDB 的 key
      storageRef: photoId,
      // 本地 dataURL 过长，不塞进结构化存储，展示时由 resolvePhotoUrl 现取
      url: persisted ? '' : input.dataUrl.slice(0, 64),
      fileName: input.fileName,
      uploadedAt: new Date().toISOString(),
      uploadedByAccountId: input.uploadedByAccountId,
    };
    const all = read<PhotoRecord>(K.photos, []);
    all.push(photo);
    write(K.photos, all);
    return photo;
  }

  async listPhotos(violationId: string): Promise<PhotoRecord[]> {
    return read<PhotoRecord>(K.photos, []).filter(
      (p) => p.violationId === violationId,
    );
  }

  async resolvePhotoUrl(photo: PhotoRecord): Promise<string> {
    const d = await getPhotoData(photo.storageRef);
    return d || photo.url || '';
  }

  async deletePhoto(photoId: string): Promise<void> {
    const all = read<PhotoRecord>(K.photos, []);
    const target = all.find((p) => p.photoId === photoId);
    write(
      K.photos,
      all.filter((p) => p.photoId !== photoId),
    );
    if (target) await deletePhotoData(target.storageRef);
  }

  /* ---------------- 转派 / 复查 ---------------- */

  async createTransfer(t: TransferRecord): Promise<TransferRecord> {
    const all = read<TransferRecord>(K.transfers, []);
    const saved: TransferRecord = {
      ...t,
      transferId: t.transferId || randomId('TR'),
    };
    all.push(saved);
    write(K.transfers, all);
    return saved;
  }

  async updateTransfer(t: TransferRecord): Promise<TransferRecord> {
    const all = read<TransferRecord>(K.transfers, []);
    const i = all.findIndex((x) => x.transferId === t.transferId);
    if (i < 0) throw new Error(`转派单不存在：${t.transferId}`);
    all[i] = { ...t };
    write(K.transfers, all);
    return all[i] as TransferRecord;
  }

  async listTransfers(): Promise<TransferRecord[]> {
    return read<TransferRecord>(K.transfers, []);
  }

  async createReview(r: ReviewRecord): Promise<ReviewRecord> {
    const all = read<ReviewRecord>(K.reviews, []);
    const saved: ReviewRecord = { ...r, reviewId: r.reviewId || randomId('RV') };
    all.push(saved);
    write(K.reviews, all);
    return saved;
  }

  async listReviews(violationId: string): Promise<ReviewRecord[]> {
    return read<ReviewRecord>(K.reviews, []).filter(
      (r) => r.violationId === violationId,
    );
  }
}
