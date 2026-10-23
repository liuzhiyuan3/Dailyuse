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

在 `miniapp/.env.local` 里配接口地址（真机调试必须是 HTTPS 域名）：

```
VITE_API_BASE=https://你的域名/api
```

不配时默认走 `http://localhost:3000/api`（仅开发者工具、且勾选「不校验合法域名」时可用）。

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
