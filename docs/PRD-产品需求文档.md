# Dailyuse 日常使用 · 产品与技术设计文档（PRD + TDD）

> **版本** v0.3 ｜ **日期** 2026-10-22 ｜ **状态** 草稿待评审
> **形态** 微信小程序（前端）+ 自建服务端（后端）+ PostgreSQL（数据库），全栈

### 修订记录

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v0.1 | 2026-10-15 | 初稿：效率工具合集（待办/便签/记账/倒数日），纯本地 |
| v0.2 | 2026-10-15 | 新增新闻资讯模块（关键词订阅 + 服务端抓取推送）；引入服务端架构 |
| **v0.3** | **2026-10-22** | **整合技术栈定案（uni-app + Fastify + Prisma + PostgreSQL）；工具数据由本地改为入库；新增接口契约、数据库 DDL、部署运维、测试用例、决策记录、术语表** |
| **v0.4** | **2026-10-22** | **新增「提醒与推送」：待办/倒数日/群组待办可推送到微信，采用一次性订阅额度制；新增 reminders 表与接口；风险 R9、决策 D11/D12** |

---

## 目录

1. [产品概述](#1-产品概述)
2. [目标用户与场景](#2-目标用户与场景)
3. [产品范围](#3-产品范围)
4. [功能需求](#4-功能需求)
5. [信息架构与页面](#5-信息架构与页面)
6. [关键流程](#6-关键流程)
7. [技术方案](#7-技术方案)
8. [数据设计](#8-数据设计)
9. [接口契约](#9-接口契约)
10. [非功能需求](#10-非功能需求)
11. [部署与运维](#11-部署与运维)
12. [测试与验收](#12-测试与验收)
13. [里程碑](#13-里程碑)
14. [风险与依赖](#14-风险与依赖)
15. [决策记录](#15-决策记录)
16. [开放问题](#16-开放问题)
17. [附录：术语表](#17-附录术语表)

> **阅读指引**：产品/评审看 §1–§6；开发看 §7–§12；决策追溯看 §15。

---

## 1. 产品概述

### 1.1 一句话定位

**「日常使用」是一个聚合高频生活小工具 + 个性化关键词资讯订阅的微信小程序**——待办、便签、记账、倒数日打开即用；再按用户订阅的关键词，由服务端定期抓取资讯并推送。不做社区、不做社交、不塞广告。

### 1.2 背景与问题

| 痛点 | 现状 |
|------|------|
| 工具太散 | 待办、记账、倒数日分散在不同小程序，装一堆、来回切 |
| 太重、太吵 | 多数工具强推登录、内购、消息轰炸，违背「用完即走」 |
| 资讯被算法裹挟 | 新闻 App 靠推荐算法喂信息，用户难主动掌控自己关心的内容 |

**机会点**：把「日常工具」和「主动订阅的资讯」收拢到一个轻量入口——工具即开即用，资讯由用户说了算。

### 1.3 目标与价值

- **用户价值**：少装 App；高频需求一个入口；资讯按自己关键词订阅，主动而非被投喂。
- **产品价值**：以「轻工具 + 主动订阅」切入，先验证留存，再决定做深哪个方向。
- **商业价值（暂缓）**：一期不做商业化；后续可考虑云同步增值订阅。

### 1.4 竞品与差异化（坦诚）

| 竞品 | 形态 | 我们的差异 |
|------|------|-----------|
| 滴答清单 | 独立 App + 小程序，功能极深 | 不做深度管理，只做「够用的轻工具」 |
| 鲨鱼记账等 | 单点记账，带理财导流 | 不导流、无广告，记账只是合集之一 |
| 今日头条 / 腾讯新闻 | 算法推荐信息流 | 不算法推荐，用户订阅什么才推什么 |

> **明确承认**：单点功能深度打不过垂直产品，资讯时效与覆盖面打不过专业平台。壁垒只能是「聚合 + 轻 + 主动订阅 + 无打扰」。这条路线是否成立，取决于用户是否愿意为「一个入口、自己说了算」买单。

### 1.5 核心假设（待验证）

| 编号 | 假设 | 验证方式 |
|------|------|---------|
| H1 | 用户愿意在一个小程序里同时用 4 个小工具 | 上线后工具使用分布 |
| H2 | 关键词订阅能带来回访（而非一次性尝鲜） | 7 日/30 日回访率 |
| H3 | 微信订阅消息额度限制下，推送仍有价值 | 推送点击率、额度消耗率 |

---

## 2. 目标用户与场景

### 2.1 用户画像

| 画像 | 特征 | 诉求 |
|------|------|------|
| **主力：都市上班族（22–35 岁）** | 手机不离手，讨厌装一堆 App，被推送轰炸 | 快速记事、记一笔钱、看倒数日；只看自己关心的资讯 |
| **次主力：学生（18–24 岁）** | 重度微信用户，价格敏感 | 免费、无广告、能用就行 |

### 2.2 核心场景

1. **「记一下」**：想起一件要做的事，2 秒记下待办。
2. **「别忘事」**：重要日子设倒数日。
3. **「钱去哪了」**：随手记一笔，月底看汇总。
4. **「随手贴」**：临时地址/清单当便签贴。
5. **「追资讯」**：订阅关键词（如「AI」「房价」），有新内容时被通知。

### 2.3 用户故事

| 角色 | 故事 | 优先级 |
|------|------|--------|
| 上班族 | 作为忙碌的上班族，我想在开会间隙快速记一条待办，以便不遗忘 | P0 |
| 上班族 | 作为记账人，我想月底看到本月支出汇总，以便知道钱花在哪 | P1 |
| 学生 | 作为学生，我想设考试/纪念日倒数，以便心里有数 | P1 |
| 信息关注者 | 作为关注行业的人，我想订阅「AI」，有新动态时被通知，以便不错过 | P1 |
| 隐私敏感者 | 作为用户，我不想注册就能用工具，以便降低使用门槛 | P0 |
| 多设备用户 | 作为用户，我换手机后希望数据还在，以便不重复劳动 | P2 |

---

## 3. 产品范围

### 3.1 一期 MVP

| 模块 | 一句话 | 优先级 |
|------|--------|--------|
| 待办清单 | 增删改查 + 完成标记 + 分类 | P0 |
| 便签 | 纯文本便签，置顶/搜索 | P0 |
| 记账 | 收支流水 + 月度汇总 | P1 |
| 倒数日 | 正/倒数日卡片 + 置顶 | P1 |
| 新闻资讯 | 关键词订阅 + 服务端定期抓取 + 订阅消息推送 | P1 |
| 工具提醒 | 待办 / 倒数日 / 群组待办到点推送到微信（额度制） | P1 |
| 服务端 | 登录鉴权、数据 CRUD、新闻聚合、定时推送 | P1 |
| 数据库 | PostgreSQL，承载全部业务数据 | P1 |

> **v0.3 一致性修正**：v0.1/v0.2 写的是「工具数据本地优先」。既然确定要数据库与全栈，**工具数据统一入库**，前端仅做本地缓存。游客模式保留为「本地暂存 + 登录后上传」。

### 3.2 二期规划

- 多设备实时同步、离线冲突合并
- 番茄钟、喝水提醒、快递查询等候选工具
- 待办重复提醒、子任务；记账预算
- 深色模式

### 3.3 明确不做（反范围）

- 不做社区、评论、分享等社交
- 不做广告位、不做理财/贷款导流
- 不做算法推荐信息流（资讯只按关键词）
- 不做多端（App/H5），一期只做微信小程序

---

## 4. 功能需求

### 4.1 全局能力

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 底部 Tab | P0 | 首页（工具宫格）+ 我的 |
| 游客模式 | P0 | 未登录可试用，数据先存本地，登录后合并上传 |
| 微信登录 | P1 | 新闻订阅/推送必需；工具不强制 |
| 订阅消息 | P1 | 资讯推送通道，见 §6.3 |
| 深色模式 | P2 | 二期 |

### 4.2 待办清单

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 新建待办 | P0 | 输入文字即建，无多余表单 |
| 完成/取消 | P0 | 点击切换，完成置灰划线 |
| 删除 | P0 | 左滑或长按，二次确认 |
| 编辑 | P1 | 修改标题/分类 |
| 分类 | P1 | 默认「全部/工作/生活」 |
| 截止提醒 | P2 | 二期接入订阅消息 |

### 4.3 便签

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 新建便签 | P0 | 标题 + 纯文本内容 |
| 列表 | P0 | 按更新时间倒序 |
| 置顶 | P1 | 置顶优先展示 |
| 搜索 | P1 | 标题/内容关键词 |
| 删除 | P0 | 二次确认 |

### 4.4 记账

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 记一笔 | P1 | 金额 + 类型（收入/支出）+ 分类 + 备注 |
| 分类管理 | P1 | 预置常用分类 |
| 流水 | P1 | 按日分组 |
| 月度汇总 | P1 | 本月支出/收入/结余 + 柱状图 |

### 4.5 倒数日

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 新建 | P1 | 名称 + 目标日期 |
| 正/倒数 | P1 | 「已过去 X 天」「还有 X 天」 |
| 列表 | P1 | 按即将到来排序 |
| 置顶 | P1 | 重要日子优先 |

### 4.6 新闻资讯

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 关键词订阅 | P1 | 输入关键词，授权一次订阅消息后建订阅 |
| 订阅管理 | P1 | 查看/删除，显示剩余推送额度 |
| 资讯列表 | P1 | 按关键词展示，点击跳原文 |
| 定时抓取 | P1 | 服务端周期抓取，按 URL 去重 |
| 订阅消息推送 | P1 | 有新内容时下发，消耗额度 |
| 推送频控 | P1 | 每关键词每日上限 + 免打扰时段 |

### 4.7 提醒与推送（新增）

**只有「特别」的工具可推送到微信**，不是所有操作都打扰用户。

| 工具 | 触发条件 | 接收人 |
|------|---------|--------|
| 待办 | 到达截止时间 | 本人 |
| 倒数日 | 目标日前 1 天 / 当天 | 本人 |
| 群组集体待办 | 到达截止时间 | 组内已授权成员 |
| 番茄钟 / 喝水 | 计时结束 | P2，一期不做 |

**额度模型（微信硬约束，产品必须围绕它设计）**

- 一次性订阅：用户授权 1 次 = 服务端可下发 1 条，用完需再次授权。
- 一次 `requestSubscribeMessage` 最多请求 3 个模板，可引导用户连续授权攒额度。
- 长期订阅仅对特定类目开放，工具类小程序拿不到。

因此产品概念是「**提醒额度**」，不是「永久提醒」：

| 规则 | 说明 |
|------|------|
| 授权即额度 | 用户点「允许」→ 服务端记录 remain +1 |
| 推送扣额度 | 下发成功一次，remain −1 |
| 额度不足 | 条目上标记「提醒待续」，进入页面时引导补充 |
| 免打扰 | 22:00–08:00 不推，顺延到次日 08:00 |
| 游客限制 | 未登录不可设提醒（无 openid） |

**界面要求**

- 条目右侧铃铛：灰=未设、亮=已设、虚线=额度耗尽。
- 设提醒时明确提示「本次授权可提醒 1 次」，不制造"永久生效"的错觉。
- 「我的」页显示剩余提醒额度总数，一键补充。

### 4.8 权限与登录态矩阵

| 能力 | 游客 | 登录用户 |
|------|------|---------|
| 使用 4 个工具 | ✅（本地暂存） | ✅（入库 + 多端） |
| 数据跨设备 | ❌ | ✅ |
| 订阅关键词 | ❌ | ✅ |
| 设置工具提醒 | ❌ | ✅（需订阅授权） |
| 接收资讯 / 提醒推送 | ❌ | ✅ |
| 数据导出 | ❌ | ✅ |

---

## 5. 信息架构与页面

### 5.1 导航

```
底部 Tab
├── 首页（工具宫格：待办 / 便签 / 记账 / 倒数日 / 新闻）
│   ├── 待办页
│   ├── 便签页 ── 便签编辑页
│   ├── 记账页
│   ├── 倒数日页
│   └── 新闻页 ── 订阅管理页 ── 资讯详情（外链）
└── 我的
    ├── 登录/资料
    ├── 我的订阅
    ├── 数据导出
    └── 关于
```

### 5.2 页面清单

| 页面 | 路径 | 核心内容 |
|------|------|---------|
| 首页 | pages/index/index | 5 个工具宫格、问候语 |
| 待办 | pages/todo/index | 输入框、筛选 tab、列表 |
| 便签 | pages/note/index | 搜索框、置顶区、列表 |
| 便签编辑 | pages/note/edit | 标题、正文、置顶开关 |
| 记账 | pages/account/index | 月度汇总卡、流水列表、记一笔按钮 |
| 倒数日 | pages/countdown/index | 倒数日卡片列表 |
| 新闻 | pages/news/index | 关键词 chips、资讯列表 |
| 订阅管理 | pages/news/subscribe | 关键词输入、订阅卡片（含额度） |
| 我的 | pages/mine/index | 登录态、入口列表 |

### 5.3 关键页面元素（线框级）

| 页面 | 必要元素 |
|------|---------|
| 首页 | 顶部问候 + 日期；5 宫格（图标/名称/未读数）；底部 Tab |
| 待办 | 顶部输入框（回车即建）；「全部/工作/生活」tab；列表项（勾选/标题/删除） |
| 记账 | 汇总卡（本月支出/收入/结余）；按日分组流水；右下「＋记一笔」 |
| 新闻 | 横向关键词 chips（可切换/新增）；资讯卡（标题/来源/时间）；下拉刷新 |
| 订阅管理 | 关键词输入 + 授权按钮；订阅卡（关键词、剩余额度、删除） |

---

## 6. 关键流程

### 6.1 首次进入

进入 → 游客态直接进首页 → 工具即点即用 → 需要跨设备/订阅时引导登录。

### 6.2 登录

```
小程序                    服务端                      微信
  │ wx.login() → code      │                           │
  ├───────────────────────►│ POST /api/auth/login      │
  │                        ├─ code2session ───────────►│
  │                        │◄── openid / session_key ──┤
  │                        ├─ upsert users             │
  │◄── { token, user } ────┤ 签发 JWT                  │
  │ 存 token（storage）     │                           │
```

### 6.3 订阅关键词并接收推送（核心）

```
小程序                          服务端                     微信平台
  │ 1. 输入关键词「AI」            │                          │
  │ 2. wx.requestSubscribeMessage  │                          │
  ├───────────────────────────────────────────────────────►│ 用户点「允许」
  │ 3. POST /api/subscribes        │                          │
  │    {keyword, templateId}       │                          │
  ├───────────────────────────────►│ 4. 建订阅 remain=1        │
  │                                │                          │
  │        （定时任务周期到）        │                          │
  │                                ├─ 5. 抓取 + 去重          │
  │                                ├─ 6. sendSubscribeMessage │
  │                                ├─────────────────────────►│ 7. 推送
  │ ◄── 8. 点击进入小程序看列表 ─────┤ remain--                 │
```

> **硬约束**：普通小程序只能用一次性订阅，一次授权 = 一次下发额度。额度耗尽需用户再次授权（见 §14 R1）。

### 6.4 记一笔账

首页 → 记账 → 记一笔 → 金额/类型/分类/备注 → 保存 → 列表与月度汇总刷新。

### 6.5 游客数据合并

游客本地暂存 → 登录成功 → 客户端上报本地数据 → 服务端按 `id/时间戳` 去重入库 → 清空本地暂存。

---

## 7. 技术方案

### 7.1 技术栈（拟定，待 §16 确认）

| 层 | 选型 | 版本基线 | 理由 |
|----|------|---------|------|
| 前端框架 | **uni-app 3（Vue 3 + TS + Vite）** | 最新稳定 | 纯小程序场景生态最成熟，坑比 uni-app x 少 |
| UI | uni-ui 按需 + 自写样式 | — | 工具类要轻，不引重型组件库 |
| 状态 | Pinia（仅跨页共享用） | — | 可选，简单页面用局部状态 |
| 后端 | **Node 22 LTS + Fastify 5 + TypeScript** | LTS | 轻、快、内置 schema 校验 |
| ORM | **Prisma** | 6.x | 迁移/类型生成/可视化 |
| 数据库 | **PostgreSQL 16** | 16.x | JSONB、索引、聚合能力强 |
| 鉴权 | code2session → **JWT** | — | 无状态，免 Redis |
| 定时任务 | node-cron | — | 进程内调度，MVP 够用 |
| 参数校验 | Zod（或 Fastify JSON Schema） | — | 二选一，不重复引入 |
| 部署 | **Docker Compose**（api + db）+ 现有 nginx | — | 与现有共享栈一致 |

**待确认**：① 前端是否从 uni-app x 迁回 uni-app；② 数据库 PostgreSQL 还是 MySQL。

### 7.2 架构拓扑

```
微信小程序 ──HTTPS──► nginx(443，现有共享栈)
                        └──► api:3000 (Fastify)
                               ├──► postgres:5432（仅内网）
                               ├──► 微信 API（登录/订阅消息）
                               └──► 新闻源 API（关键词检索）
                                     ▲
                              node-cron（抓取 + 推送）
```

### 7.3 项目结构

```
Dailyuse/
├── miniapp/                  # 前端（uni-app 3）
│   ├── pages/
│   │   ├── index/            # 首页宫格
│   │   ├── todo/
│   │   ├── note/
│   │   ├── account/
│   │   ├── countdown/
│   │   ├── news/
│   │   └── mine/
│   ├── api/                  # request 封装、接口定义
│   ├── store/                # Pinia（按需）
│   ├── utils/                # 日期、格式化、storage
│   ├── static/
│   ├── App.vue
│   ├── main.ts
│   ├── pages.json
│   ├── manifest.json
│   └── uni.scss
├── server/                   # 后端（Fastify + TS）
│   ├── src/
│   │   ├── index.ts          # 入口
│   │   ├── config.ts         # env 校验
│   │   ├── plugins/          # db、auth、cors
│   │   ├── routes/           # auth / todos / notes / accounts / countdowns / subscribes / news
│   │   ├── services/         # 业务逻辑（新闻聚合、推送）
│   │   ├── jobs/             # cron
│   │   └── lib/              # wechat、news source
│   ├── prisma/schema.prisma
│   ├── Dockerfile
│   └── package.json
├── deploy/
│   ├── docker-compose.yml
│   └── nginx.conf
├── docs/
└── README.md
```

> **迁移说明**：当前根目录的 uni-app x 模板（`.uvue` / `.uts`）与 `server/` 下 5 个零依赖骨架文件（`config.js`、`storage.js`、`httpClient.js`、`package.json`、`.env.example`）均为过渡产物。技术栈确认后：前端迁入 `miniapp/`，后端按 Fastify + TS 重写，旧文件删除或留作参考。

### 7.4 服务端分层

| 层 | 职责 | 约束 |
|----|------|------|
| routes | 路由、入参校验、鉴权 | 不写业务逻辑 |
| services | 业务规则、事务 | 不直接拼 SQL |
| repositories | Prisma 数据访问 | 仅本层操作 DB |
| jobs | 定时抓取、推送 | 幂等、可重入 |

### 7.5 前端要点

- `api/request.ts` 统一封装：注入 Bearer token、统一错误码处理、401 自动跳登录。
- 工具页共用一套「列表 + 新增 + 编辑」交互模式，减少重复代码。
- 游客态数据存 `uni.setStorageSync`，登录后一次性合并上报。

---

## 8. 数据设计

### 8.1 ER 关系

```
users 1 ──< todos
      1 ──< notes
      1 ──< accounts
      1 ──< countdowns
      1 ──< subscribes
      1 ──< push_logs
news_items 1 ──< push_logs
```

### 8.2 表结构（PostgreSQL DDL）

```sql
-- 用户
create table users (
  id          bigserial primary key,
  openid      varchar(64)  not null unique,
  nickname    varchar(64),
  avatar_url  varchar(512),
  created_at  timestamptz  not null default now(),
  updated_at  timestamptz  not null default now()
);

-- 待办
create table todos (
  id         bigserial primary key,
  user_id    bigint       not null references users(id) on delete cascade,
  title      varchar(200) not null,
  done       boolean      not null default false,
  category   varchar(32)  not null default 'default',
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);
create index idx_todos_user on todos (user_id, done, created_at desc);

-- 便签
create table notes (
  id         bigserial primary key,
  user_id    bigint       not null references users(id) on delete cascade,
  title      varchar(120) not null default '',
  content    text         not null default '',
  pinned     boolean      not null default false,
  created_at timestamptz  not null default now(),
  updated_at timestamptz  not null default now()
);
create index idx_notes_user on notes (user_id, pinned desc, updated_at desc);

-- 记账
create table accounts (
  id          bigserial primary key,
  user_id     bigint        not null references users(id) on delete cascade,
  type        varchar(8)    not null check (type in ('income', 'expense')),
  amount      numeric(12,2) not null check (amount >= 0),
  category    varchar(32)   not null,
  remark      varchar(200)  not null default '',
  occurred_at date          not null default current_date,
  created_at  timestamptz   not null default now()
);
create index idx_accounts_user_date on accounts (user_id, occurred_at desc);

-- 倒数日
create table countdowns (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  name        varchar(80) not null,
  target_date date        not null,
  pinned      boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index idx_countdowns_user on countdowns (user_id, target_date);

-- 关键词订阅
create table subscribes (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  keyword     varchar(20) not null,
  template_id varchar(64) not null,
  remain      int         not null default 1,
  created_at  timestamptz not null default now(),
  unique (user_id, keyword)
);

-- 新闻缓存
create table news_items (
  id           bigserial primary key,
  keyword      varchar(20)  not null,
  title        varchar(200) not null,
  summary      varchar(400) not null default '',
  url          text         not null,
  source       varchar(64)  not null default '',
  published_at timestamptz,
  fetched_at   timestamptz  not null default now(),
  url_hash     varchar(40)  not null unique
);
create index idx_news_keyword on news_items (keyword, published_at desc);

-- 推送日志（资讯 + 工具提醒共用）
create table push_logs (
  id          bigserial primary key,
  user_id     bigint      not null references users(id) on delete cascade,
  channel     varchar(12) not null,  -- news / reminder
  keyword     varchar(20),
  news_id     bigint      references news_items(id) on delete set null,
  reminder_id bigint,
  status      varchar(16) not null,  -- sent / failed / skipped
  sent_at     timestamptz not null default now()
);
create index idx_push_user_day on push_logs (user_id, sent_at desc);

-- 工具提醒（额度制）
create table reminders (
  id         bigserial primary key,
  user_id    bigint      not null references users(id) on delete cascade,
  tool_type  varchar(16) not null,   -- todo / countdown / group_todo
  target_id  bigint      not null,
  remind_at  timestamptz not null,
  remain     int         not null default 1,  -- 剩余可推送次数
  status     varchar(12) not null default 'pending', -- pending / sent / expired / canceled
  created_at timestamptz not null default now()
);
create index idx_reminders_due on reminders (status, remind_at);
```

### 8.3 存储与容量

| 项 | 估算 | 说明 |
|----|------|------|
| 单用户工具数据 | < 1 MB | 文本为主，无附件 |
| 新闻缓存 | 每关键词保留 50 条 | 定期清理 30 天前的推送日志 |
| 初期规模 | 千级用户 / 十万级行 | 单实例 PostgreSQL 绰绰有余 |

---

## 9. 接口契约

### 9.1 通用约定

| 项 | 约定 |
|----|------|
| Base URL | `https://<你的域名>/api` |
| 鉴权 | `Authorization: Bearer <JWT>` |
| 响应包裹 | `{ "code": 0, "data": ..., "message": "ok" }` |
| 分页 | `?page=1&pageSize=20` → `{ list, total, page, pageSize }` |
| 时间 | ISO 8601（UTC），前端本地化展示 |

### 9.2 接口清单

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /auth/login | code 换 token | 否 |
| GET | /health | 健康检查 | 否 |
| GET / POST | /todos | 列表 / 新建 | 是 |
| PATCH / DELETE | /todos/:id | 更新 / 删除 | 是 |
| GET / POST | /notes | 列表 / 新建 | 是 |
| PATCH / DELETE | /notes/:id | 更新 / 删除 | 是 |
| GET / POST | /accounts | 流水 / 记账 | 是 |
| PATCH / DELETE | /accounts/:id | 更新 / 删除 | 是 |
| GET | /accounts/summary?month=YYYY-MM | 月度汇总 | 是 |
| GET / POST | /countdowns | 列表 / 新建 | 是 |
| PATCH / DELETE | /countdowns/:id | 更新 / 删除 | 是 |
| GET / POST | /subscribes | 订阅列表 / 新建 | 是 |
| DELETE | /subscribes/:id | 删除订阅 | 是 |
| GET | /news?keyword=&page= | 关键词资讯 | 是 |
| GET / POST | /reminders | 提醒列表 / 创建（含授权额度） | 是 |
| DELETE | /reminders/:id | 取消提醒 | 是 |
| POST | /reminders/:id/grant | 追加一次推送额度 | 是 |

### 9.3 关键接口示例

**登录**

```http
POST /api/auth/login
Content-Type: application/json

{ "code": "wx.login 返回的 code" }
```

```json
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOi...",
    "user": { "id": 1, "nickname": null, "avatarUrl": null }
  }
}
```

**新建待办**

```http
POST /api/todos
Authorization: Bearer <token>

{ "title": "买菜", "category": "life" }
```

```json
{ "code": 0, "data": { "id": 12, "title": "买菜", "done": false, "category": "life", "createdAt": "2026-10-22T11:00:00Z" } }
```

**订阅关键词**

```http
POST /api/subscribes
Authorization: Bearer <token>

{ "keyword": "AI", "templateId": "模板 ID" }
```

```json
{ "code": 0, "data": { "id": 3, "keyword": "AI", "remain": 1 } }
```

**资讯列表**

```http
GET /api/news?keyword=AI&page=1&pageSize=20
Authorization: Bearer <token>
```

```json
{
  "code": 0,
  "data": {
    "list": [
      { "id": 88, "title": "…", "summary": "…", "url": "https://…", "source": "…", "publishedAt": "2026-10-22T08:00:00Z" }
    ],
    "total": 42, "page": 1, "pageSize": 20
  }
}
```

### 9.4 错误码

| code | HTTP | 含义 |
|------|------|------|
| 0 | 200 | 成功 |
| 400 | 400 | 参数校验失败 |
| 401 | 401 | 未登录 / token 失效 |
| 403 | 403 | 无权限（越权访问他人数据） |
| 404 | 404 | 资源不存在 |
| 429 | 429 | 触发频控 |
| 500 | 500 | 服务端异常 |

---

## 10. 非功能需求

| 维度 | 要求 |
|------|------|
| 性能 | 工具页首屏 ≤1.5s；接口 P95 ≤800ms；新闻列表走缓存 |
| 安全 | 全站 HTTPS；JWT 过期 7 天；所有查询强制 `user_id` 过滤防越权 |
| 隐私 | 只存 openid、昵称头像（可选）、业务数据；不采集通讯录/位置 |
| 合规 | 隐私协议覆盖「关键词订阅与消息推送」；提供数据删除能力 |
| 可用性 | 服务端单实例 + 自动重启；数据库每日备份 |
| 推送克制 | 每关键词每日 ≤3 条；22:00–08:00 不推 |
| 兼容 | 微信基础库 ≥ 2.30；iOS/Android 主流机型 |

---

## 11. 部署与运维

### 11.1 Docker Compose（结构）

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dailyuse
      POSTGRES_USER: dailyuse
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    build: ../server
    env_file: .env
    environment:
      DATABASE_URL: postgresql://dailyuse:${DB_PASSWORD}@db:5432/dailyuse
    depends_on: [db]
    restart: unless-stopped

volumes:
  pgdata:
```

### 11.2 Nginx 反代

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 11.3 环境变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `WX_APPID` / `WX_SECRET` | 小程序凭证 |
| `JWT_SECRET` | JWT 签名密钥 |
| `NEWS_API_URL` / `NEWS_API_KEY` | 新闻源 |
| `WX_TEMPLATE_ID` | 订阅消息模板 |
| `PUSH_PER_KEYWORD_PER_DAY` | 推送频控上限 |
| `QUIET_START_HOUR` / `QUIET_END_HOUR` | 免打扰时段 |

### 11.4 微信侧配置

| 项 | 要求 |
|----|------|
| request 合法域名 | 必须 HTTPS，且域名已备案 |
| 订阅消息模板 | 在小程序后台「订阅消息」创建，字段与代码一致 |
| 隐私协议 | 后台配置用户隐私保护指引，声明收集范围 |
| 类目 | 需确认「新闻资讯」相关类目与主体资质（见 §14 R3） |

### 11.5 备份与监控

```bash
# 每日 3 点备份
0 3 * * * docker exec dailyuse-db pg_dump -U dailyuse dailyuse | gzip > /backup/dailyuse-$(date +\%F).sql.gz
```

- 健康检查：`GET /api/health`
- 日志：stdout 收集，保留 7 天
- 告警（可选）：接口 5xx 或进程退出时通知

---

## 12. 测试与验收

### 12.1 验收用例

| 编号 | 场景 | 预期 |
|------|------|------|
| TC-01 | 游客进入并使用待办 | 可增删改查，数据本地留存 |
| TC-02 | 未带 token 访问受保护接口 | 返回 401 |
| TC-03 | 微信登录 | 返回 token 与用户信息 |
| TC-04 | 待办 CRUD | 增删改查正确，列表排序正确 |
| TC-05 | 便签搜索 | 命中标题/内容 |
| TC-06 | 记账月度汇总 | 支出/收入/结余与流水一致 |
| TC-07 | 倒数日计算 | 正/倒数天数正确（含跨时区） |
| TC-08 | 新建关键词订阅 | 记录创建，remain=1 |
| TC-09 | 订阅额度递减 | 推送一次后 remain=0，不再推送 |
| TC-10 | 新闻抓取去重 | 同一 URL 不重复入库 |
| TC-11 | 推送频控 | 超每日上限后跳过 |
| TC-12 | 免打扰时段 | 时段内不推送 |
| TC-13 | 越权访问 | A 用户无法读取/修改 B 用户数据 |
| TC-14 | 游客数据合并 | 登录后本地数据入库且不重复 |

### 12.2 测试策略

- 接口层：Fastify `inject` 做集成测试，覆盖 TC-02/03/04/08/13
- 定时任务：单测 `services/push`，mock 微信 API 与新闻源
- 前端：关键页面手动回归 + 真机预览

---

## 13. 里程碑

| 阶段 | 范围 | 交付物 | 依赖 |
|------|------|--------|------|
| **M0 基建** | 仓库结构、Prisma schema、Compose、健康检查 | 可启动的空服务 | 技术栈确认 |
| **M1 认证** | 登录、JWT、用户表 | 登录闭环 | 微信 appid |
| **M2 工具** | 4 个工具前后端 CRUD | 工具可用 | M1 |
| **M3 订阅与抓取** | 订阅 CRUD、新闻源、cron 抓取 | 资讯列表可看 | 新闻源选定 |
| **M4 推送** | 资讯推送 + 工具提醒 + 额度/频控/免打扰 | 推送闭环 | 模板 ID |
| **M5 提审** | 域名/白名单、隐私协议、回归测试 | 可提审版本 | 备案/类目 |

---

## 14. 风险与依赖

### 14.1 风险登记

| 编号 | 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|------|
| R1 | 订阅消息只能一次性授权，额度耗尽即无法推送 | 高 | 高 | 引导按需再订阅；小程序内红点兜底；推送做「亮点提醒」而非全量 |
| R2 | 关键词新闻源依赖第三方，免费稳定源难找 | 高 | 高 | 适配器隔离；先 mock 跑通；选定供应商后再接 |
| R3 | 新闻类目资质：个人主体大概率过不了审 | 中高 | **致命** | 先到公众平台确认类目；不成立则改形态为「关键词资讯摘要」 |
| R4 | request 合法域名需 HTTPS + 备案 | 中 | 高 | 提前备案，复用现有域名 |
| R5 | 服务端运维（单机故障） | 中 | 中 | 自动重启 + 每日备份 + 健康检查 |
| R6 | 工具同质化，冷启动慢 | 中 | 中 | 差异化靠聚合 + 无广告 + 主动订阅 |
| R7 | 越权访问（查他人数据） | 低 | 高 | 所有查询强制 user_id 过滤 + 测试覆盖 |
| R8 | 第三方 API 调用成本 | 低 | 中 | 缓存 + 频控 + 只抓被订阅关键词 |
| R9 | 工具提醒依赖一次性订阅额度，用户不续授权则提醒失效 | 高 | 高 | 铃铛三态标识 + 额度耗尽提醒补充；接受「提醒不是永久」 |

### 14.2 外部依赖

| 依赖 | 用途 | 状态 |
|------|------|------|
| 微信小程序 appid / secret | 登录、推送 | 待提供 |
| 订阅消息模板 ID | 推送 | 待创建 |
| 新闻 API（聚合数据/天行数据等） | 关键词检索 | 待选型 |
| 服务器 + 域名 + 备案 | 部署 | 已有服务器，域名待确认 |

---

## 15. 决策记录

| ID | 决策 | 结论 | 状态 |
|----|------|------|------|
| D1 | 新闻模块放一期还是二期 | 一期 | ✅ 已定 |
| D2 | 订阅形态 | 关键词订阅（非新闻源地址） | ✅ 已定 |
| D3 | 是否做服务端 | 做，全栈 | ✅ 已定 |
| D4 | 是否引入数据库 | 引入 PostgreSQL | ✅ 已定 |
| D5 | 前端框架 | uni-app 3（Vue 3 + TS） | ⏳ 待确认（从 uni-app x 迁回） |
| D6 | 后端框架 | Fastify 5 + TypeScript | ⏳ 待确认（推荐） |
| D7 | ORM | Prisma | ⏳ 待确认（推荐） |
| D8 | 数据库 | PostgreSQL 16（备选 MySQL） | ⏳ 待确认 |
| D9 | 鉴权 | JWT | ⏳ 待确认（推荐） |
| D10 | 部署 | Docker Compose + 现有 nginx | ⏳ 待确认 |
| D11 | 工具提醒通道 | 微信订阅消息 + 额度制（一次性授权，用完续） | ✅ 已定 |
| D12 | 可推送工具范围 | 待办 / 倒数日 / 群组集体待办（一期） | ✅ 已定 |

> **说明**：D5–D10 为本次整合给出的推荐方案，你确认后在实现时锁定。已落盘的 `server/` 零依赖骨架（config/storage/httpClient）不适用于该方案，确认后删除或归档。

---

## 16. 开放问题

| 编号 | 问题 | 影响 |
|------|------|------|
| Q1 | 前端是否接受从 uni-app x 迁回 uni-app？ | 决定 D5 与迁移工作量 |
| Q2 | 数据库用 PostgreSQL 还是复用现有 MySQL？ | 决定 D8 |
| Q3 | 新闻源选哪家？是否已有 API Key？ | 决定 M3 能否开工 |
| Q4 | 小程序 appid / secret / 模板 ID 何时提供？ | 决定 M1/M4 |
| Q5 | 部署域名与备案状态？ | 决定 M5 |
| Q6 | 小程序主体是个人还是企业？新闻类目资质如何？ | **可能推翻新闻模块** |
| Q7 | 工具数据是否确认全部入库（放弃纯本地）？ | 决定 M2 实现方式 |

---

## 17. 附录：术语表

| 术语 | 解释 |
|------|------|
| openid | 用户在同一小程序内的唯一标识 |
| code2session | 微信登录凭证校验接口，code 换 openid/session_key |
| 订阅消息 | 微信小程序的服务通知能力，需用户主动授权 |
| 一次性订阅 | 一次授权对应一次下发额度，用完需再授权 |
| JWT | JSON Web Token，无状态鉴权令牌 |
| Prisma | Node 生态 ORM，提供类型安全查询与迁移 |
| JSONB | PostgreSQL 的二进制 JSON 存储类型 |
| ucss | uni-app x 编译到小程序时的样式重置机制 |
| 频控 | 单位时间内限制推送/请求次数 |
| 提醒额度 | 一次订阅授权对应一次可下发次数，用完需再次授权 |
