/**
 * MOBILE-WPS-V1 · 数据适配层接口（**迁移关键**）
 *
 * 分层：UI → 业务数据模型 → **本适配层** → 传输实现（WPS / 本地 / 未来 HSE Backend）
 *
 * 未来从「手机 → WPS」迁移到「手机 → HSE Backend → PostgreSQL」时，
 * **只需要替换 transports/ 下的实现**，页面与业务模型零改动。
 *
 * ⚠️ 关键安全边界：
 * 本接口的实现**绝不允许**在浏览器侧持有 WPS 的 AppID / AppSecret / access_token。
 * WPS 的 client_credentials 是**应用级（租户级）凭证**，下发到浏览器 = 交出整表读写权，
 * 且 WPS 侧无法按登录用户做行级隔离。因此「手机直连 WPS」在本项目中被判定为不可行，
 * HTTP 传输实现只与「持有凭证的轻量中间层」通信。
 */

import type {
  Area,
  MobileAccount,
  PhotoRecord,
  PhotoType,
  ReviewRecord,
  RosterEmployee,
  TransferRecord,
  ViolationBundle,
  ViolationRecord,
  ViolationRule,
} from '../core/types';

/** 传输实现类型 */
export type TransportKind = 'local' | 'http';

/** 写入照片的入参（二进制不经过业务模型，由传输层各自落库） */
export interface PutPhotoInput {
  violationId: string;
  photoType: PhotoType;
  fileName: string;
  /** dataURL（本地实现直接存；HTTP 实现转 Blob 上传） */
  dataUrl: string;
  uploadedByAccountId: string;
}

/**
 * 数据适配层接口。
 * 所有方法都是异步的 —— 本地实现也必须异步，保证将来换成 HTTP 时调用方零改动。
 */
export interface MwTransport {
  /** 实现类型 */
  readonly kind: TransportKind;
  /** 人可读名称（页面上显示当前数据源） */
  readonly label: string;
  /** 数据源说明 */
  readonly description: string;
  /** 当前数据是否为 TEST 占位数据 */
  readonly isTestData: boolean;

  /* ---------------- 主数据（严禁前端硬编码） ---------------- */

  listAccounts(): Promise<MobileAccount[]>;
  listRoster(): Promise<RosterEmployee[]>;
  listRules(): Promise<ViolationRule[]>;
  listAreas(): Promise<Area[]>;

  /* ---------------- 三违记录 ---------------- */

  /**
   * 分配当日序号（用于生成三违记录ID）。
   * 由传输层按其持久化的当日记录数分配，避免前端随机造号导致重号。
   */
  nextViolationSeq(dateStr: string): Promise<number>;
  createRecord(record: ViolationRecord): Promise<ViolationRecord>;
  updateRecord(record: ViolationRecord): Promise<ViolationRecord>;
  getRecord(violationId: string): Promise<ViolationBundle | null>;
  listRecords(): Promise<ViolationRecord[]>;

  /* ---------------- 照片 ---------------- */

  putPhoto(input: PutPhotoInput): Promise<PhotoRecord>;
  listPhotos(violationId: string): Promise<PhotoRecord[]>;
  /** 解析可渲染地址（本地=dataURL；WPS 附件可能换不出直链 ⇒ 返回空串） */
  resolvePhotoUrl(photo: PhotoRecord): Promise<string>;
  deletePhoto(photoId: string): Promise<void>;

  /* ---------------- 转派 / 复查 ---------------- */

  createTransfer(t: TransferRecord): Promise<TransferRecord>;
  updateTransfer(t: TransferRecord): Promise<TransferRecord>;
  listTransfers(): Promise<TransferRecord[]>;
  createReview(r: ReviewRecord): Promise<ReviewRecord>;
  listReviews(violationId: string): Promise<ReviewRecord[]>;
}
