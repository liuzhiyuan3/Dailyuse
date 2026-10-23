# Dailyuse 日常使用

高频小工具 + 协作群组 + 关键词资讯的微信小程序，全栈自建。

```
Dailyuse/
├── miniapp/          # 前端（uni-app 3 + Vue3 + TS）
├── server/           # 后端（Fastify + Prisma + TS）
├── deploy/           # Docker Compose + nginx 片段
├── docs/             # PRD / 界面稿
└── legacy/           # 旧 uni-app x 模板（已停用，仅存档）
```

## 一、本地跑起来

### 1. 数据库 + API

```bash
cd deploy
cp .env.example .env          # 改 POSTGRES_PASSWORD / JWT_SECRET
docker compose up -d db       # 只起数据库
```

```bash
cd server
cp .env.example .env
# DATABASE_URL 指向 localhost:5432
npm install
npx prisma migrate deploy     # 按 prisma/migrations 建表（迁移已入库，不要用 db push）
npm run dev                   # http://localhost:3000
```

验证：

```bash
curl http://localhost:3000/api/health
# {"code":0,"data":{"ok":true,"db":"up","loginMode":"wx","devLogin":false}}
```

接口冒烟（登录、越权、四类工具、群组、订阅、提醒、用户资料、资讯订阅隔离共 40 项）：

```bash
npm run smoke
```

> 冒烟会往库里写测试数据，建议指到独立实例：`BASE=http://127.0.0.1:3100/api DATABASE_URL=file:/tmp/test.db npm run smoke`

未配置 `WX_SECRET` 时登录走 dev 模式（openid = `DEV_OPENID` 或 `dev-<code>`），方便本地联调。

### 2. 小程序

```bash
cd miniapp
npm install
npm run dev:mp-weixin
```

微信开发者工具导入 `miniapp/dist/dev/mp-weixin`，详情里勾选「不校验合法域名」。

## 二、部署到服务器

```bash
cd deploy
cp .env.example .env          # 填密码、JWT、微信 appid/secret
docker compose up -d --build
```

- API 只绑 `127.0.0.1:3000`，公网进不来
- 把 `deploy/nginx.conf` 的 `location /api/` 加进现有站点，重启 nginx
- 微信后台：request 合法域名填 `https://你的域名`（必须 HTTPS + 已备案）

容器启动时会先跑 `prisma migrate deploy` 再起服务，迁移文件在 `server/prisma/migrations/`，**必须入库**——缺了它，生产环境会起得来但一张表都没有。

## 三、当前完成度

> 后端已实测：TypeScript 类型检查通过，接口冒烟 **40/40 通过**（SQLite 临时库跑通全链路后切回 PostgreSQL）。
> 迁移已实测：`prisma migrate deploy` 在空 PostgreSQL 上建出 18 张表。
> 前端已实测：`npm run build:mp-weixin` 编译通过（uni-app Compiler 5.33 / vue3），8 个页面产物齐全，体积 230 KB / 预算 1536 KB。

| 模块 | 状态 |
|------|------|
| 后端骨架（health / 登录 / 待办 CRUD） | ✅ 代码就位 |
| 数据库 schema（18 张表 + 初始迁移） | ✅ Prisma 已定义、迁移已入库 |
| Docker 部署编排 | ✅ 非 root 运行 + HEALTHCHECK + `npm ci` |
| 前端 11 个页面 | ✅ 全部接通接口 |
| 便签 / 记账 / 倒数日 | ✅ 含编辑、日期选择、倒数日提醒 |
| 群组 | ✅ 创建/邀请/12 个预设工具(待办/清单/记账/活动/计分/点餐/公告/菜谱/链接/快递/值日/愿望)/自定义工具/解散/退出/移除成员 |
| 资讯 | ✅ 订阅/删除/订阅管理页/抓取(API 或 RSS)/推送/按日分组+未读/详情(web-view) |
| 工具提醒 | ✅ 待办与倒数日：新建/改期/取消 + 提醒列表 |
| 登录与资料 | ✅ 登录模式显式区分、`/auth/me` 读改资料、生产禁止调试登录 |
| 接口限流 | ✅ 120 次/分钟（IP + 路径，`TRUST_PROXY` 白名单） |
| CI 门禁 | ✅ 迁移一致性 / 类型 / 冒烟 / 包体预算 / 依赖审计 |

## 四、登录模式

服务端按 `WX_APPID` + `WX_SECRET` 是否齐全自动判定，健康检查里能看到：

| 模式 | 触发条件 | 行为 |
|------|----------|------|
| `wx` | appid 与 secret 都配了 | `wx.login` 的 code 真的发给 `jscode2session` 换 openid |
| `dev` | 缺 secret | **不请求微信**，openid 取 `DEV_OPENID`，否则用 `dev-<code>` |

`dev` 模式只是本地联调用的假登录，任何人伪造 code 都能换到 token，所以：

- `NODE_ENV=production` 且处于 `dev` 模式时，`/auth/login` 直接返回 **503**（除非显式设 `ALLOW_DEV_LOGIN=1`）
- `GET /api/health` 返回 `loginMode` 与 `devLogin`，部署后先看一眼

接口：

```bash
POST  /api/auth/login    # { code } -> { token, user, loginMode }
GET   /api/auth/me       # 当前用户资料，顺带校验 token 是否有效
PATCH /api/auth/me       # { nickname?, avatarUrl? }，昵称 ≤24 字，头像须 http(s)
POST  /api/auth/logout   # 语义占位；JWT 无状态，实际清理在前端删 token
```

## 五、付费骨架（未接支付）

已有权益模型和门禁，**但没接支付，默认不拦人**。设计只有一条铁律：权益只从数据库读，客户端传来的 `tier` 一律丢弃。

数据模型（`users` 表）：

| 字段 | 说明 |
|------|------|
| `tier` | `free` / `pro`，只能由服务端写 |
| `paid_until` | pro 到期时间，`null` = 永久；到期后自动按 free 处理，无需定时任务回写 |

开关与用法：

```bash
PAY_ENFORCED=0   # 默认：pro 接口对 free 用户放行，只在日志里记 [paywall] dry-run
PAY_ENFORCED=1   # 真正拦人：free 用户拿到 402
```

```bash
# 手动开通（运维/测试，不走 HTTP，没有后门接口）
npm run tier -- --openid dev-local --tier pro --days 365
npm run tier -- --openid dev-local --tier free     # 降级
npm run tier -- --list                             # 看所有人的权益
```

要新增一个付费接口，只需在路由上加门禁（示例见 `PATCH /groups/:id/tools`）：

```ts
app.patch('/xxx', { preHandler: app.requirePro }, async (req) => { /* ... */ });
```

`402` 响应带 `{ needTier, currentTier, paidUntil }`，前端 `request()` 会统一 emit `need-pro` 并给出提示。

**尚未实现**（接支付时才需要）：订单表与回调验签、幂等、iOS 端隐藏虚拟支付入口（微信规则禁止 iOS 用微信支付买会员）。

## 六、约定

- 所有查询强制带 `userId`，防越权
- 接口统一返回 `{ code, data, message }`
- 设计 token 只在 `miniapp/src/styles/tokens.scss` 改
- 技术栈与表结构以 `docs/PRD-产品需求文档.md`（v0.4）为准
