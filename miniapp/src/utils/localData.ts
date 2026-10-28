// 游客模式：未登录时工具数据暂存本机，登录后合并上报（PRD §6.5 / TC-14）。
// 待办/打卡的本地 id 作为导入幂等键，断网重试不会重复创建或覆盖云端编辑。
import { request } from '@/api/http';

const PREFIX = 'dailyuse_local_';

export const LOCAL_TOOLS = ['todos', 'notes', 'accounts', 'countdowns', 'wheels', 'habits'] as const;
export type LocalToolKey = (typeof LOCAL_TOOLS)[number];

export interface LocalTodo {
  id: string;
  title: string;
  done: boolean;
  category: string;
  createdAt: string;
  dueAt?: string | null;
  doneAt?: string | null;
}
export interface LocalNote {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  updatedAt: string;
}
export interface LocalAccount {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  remark: string;
  occurredAt: string;
}
export interface LocalCountdown {
  id: string;
  name: string;
  targetDate: string;
  pinned: boolean;
}
export interface LocalWheel {
  id: string;
  title: string;
  items: string[];
}
export interface LocalHabit {
  id: string;
  name: string;
  createdAt: string;
  /** 已打卡的日期（YYYY-MM-DD） */
  days: string[];
}

export function loadLocal<T>(key: LocalToolKey): T[] {
  return uni.getStorageSync(PREFIX + key) || [];
}

export function saveLocal<T>(key: LocalToolKey, list: T[]) {
  uni.setStorageSync(PREFIX + key, list);
}

export function newLocalId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 本机暂存条数：用于游客态提示 */
export function localTotal() {
  return LOCAL_TOOLS.reduce((n, k) => n + loadLocal<unknown>(k).length, 0);
}

/** 逐条上传，失败的原样留在本机，下次登录再试 */
async function mergeList<T>(key: LocalToolKey, upload: (item: T) => Promise<unknown>): Promise<number> {
  const items = loadLocal<T>(key);
  if (!items.length) return 0;

  const failed: T[] = [];
  let ok = 0;
  for (const item of items) {
    try {
      await upload(item);
      ok++;
    } catch {
      failed.push(item);
    }
  }
  saveLocal(key, failed);
  return ok;
}

/** 登录成功后调用：把本机游客数据并入云端，返回成功条数 */
export async function mergeLocalData(): Promise<number> {
  let merged = 0;

  merged += await mergeList<LocalTodo>('todos', (t) =>
    request('/todos', {
      method: 'POST',
      data: {
        localId: t.id,
        title: t.title,
        category: t.category,
        done: t.done,
        doneAt: t.doneAt,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
      },
    })
  );

  merged += await mergeList<LocalNote>('notes', (n) =>
    request('/notes', { method: 'POST', data: { title: n.title, content: n.content, pinned: n.pinned } })
  );

  merged += await mergeList<LocalAccount>('accounts', (a) =>
    request('/accounts', {
      method: 'POST',
      data: { type: a.type, amount: a.amount, category: a.category, remark: a.remark, occurredAt: a.occurredAt },
    })
  );

  merged += await mergeList<LocalCountdown>('countdowns', (c) =>
    request('/countdowns', {
      method: 'POST',
      data: { name: c.name, targetDate: c.targetDate, pinned: c.pinned },
    })
  );

  merged += await mergeList<LocalWheel>('wheels', (w) =>
    request('/wheels', {
      method: 'POST',
      data: { title: w.title, items: w.items },
    })
  );

  // 打卡项与全部历史记录一起入库；任何一步失败均保留本地记录。
  merged += await mergeList<LocalHabit>('habits', (h) =>
    request('/habits', {
      method: 'POST',
      data: { localId: h.id, name: h.name, days: h.days, createdAt: h.createdAt },
    })
  );

  return merged;
}
