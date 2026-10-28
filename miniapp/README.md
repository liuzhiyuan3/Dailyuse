# Dailyuse 小程序端（uni-app 3 + Vue3 + TS）

## 初始化

DCloud 的 npm 包分多条通道：`latest` 是 Vue2 版（2.0.2-xxx），**Vue3 要用 `vue3` tag**（3.0.0-alpha-xxx）。
`@dcloudio/vite-plugin-uni` 的 peer 精确要求 **vite 5.2.8**，不要升到 6。

如果依赖装不上，改用官方模板重新初始化，再把 `src/` 覆盖进去：

```bash
npx degit dcloudio/uni-preset-vue#vite-ts tmp-uni
cp -r tmp-uni/* .
```

或者直接用 HBuilderX：
1. 新建 → uni-app 项目 → 选「默认模板 + Vue3 + TS」
2. 把本目录的 `src/` 覆盖进新项目
3. 运行到微信开发者工具

## 开发

```bash
npm install
npm run dev:mp-weixin
```

产物在 `dist/dev/mp-weixin`，用微信开发者工具导入该目录。

## 环境变量

生产构建自动读取已提供的 `miniapp/.env.production`：

```
VITE_API_BASE=https://lzy.benefitgpt.top/api
```

`npm run build:mp-weixin` 输出到 `dist/build/mp-weixin`，上传此目录。
微信后台 request 合法域名填写 `https://lzy.benefitgpt.top`（不带 `/api`）。

本地开发自动读取 `.env.development`，使用 `http://localhost:3000/api`。
如需真机联调，在被 Git 忽略的 `.env.development.local` 中覆盖地址；
如需覆盖生产地址，使用 `.env.production.local`。修改环境文件后重新构建。

网页管理后台入口为 `https://admin.benefitgpt.top`，由独立的 Nginx 站点代理。

## 页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 工具首页 | `src/pages/index/index.vue` | 工具宫格（可编辑）、今日概览、协作群组、动态 |
| 待办 | `src/pages/todo/index.vue` | 今天/本周/全部、增删改查、提醒设置与改期 |
| 资讯 | `src/pages/news/index.vue` | 关键词订阅、列表、刷新 |
| 资讯详情 | `src/pages/news/detail.vue` | web-view 打开原文（需业务域名白名单） |
| 群组 | `src/pages/group/detail.vue` | 集体待办、成员、分享邀请、解散/退出 |
| 我的 | `src/pages/mine/index.vue` | 登录、昵称编辑、调试账号标记、提醒额度、设置入口 |

## 设计 token

`src/styles/tokens.scss`（E 青黛）：`--bg #F4F6FB`、`--accent #3B5BDB`、渐变 `#5C7CFA → #3B5BDB`。
改主题只动这一个文件。
