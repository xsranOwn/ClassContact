# 班级沟通系统 (chatroom)

> 教师与班级大屏之间的实时沟通系统,微信风格界面,单端口全栈部署。

教师(A)与班级大屏(B)之间的实时沟通系统,界面与微信类似。服务端使用 Node.js + Express + Socket.IO,数据库 MySQL,前端 Vue 3 + Vite + PWA,文件通过 OneDrive 企业版(Microsoft Graph)存储。

## ✨ 功能亮点

- **实时聊天**:Socket.IO 收发消息、已读回执、打字提示、在线状态(聊天范围为「班级成员 ↔ 本班大屏」)
- **班级管理**:班主任创建班级(自动生成大屏账号)、邀请码入班、入班审核、成员移除、大屏密码重置
- **大屏账号生命周期**:创建班级自动生成大屏账号(用户名 = 班级编号,如 `202415`),删除班级级联删除账号与消息
- **文件传输**:OneDrive 直传(服务器签发上传会话,客户端分片直传,不经服务器转发)+ 按月目录 + 删除状态持久化 + 图片/视频预览
- **PWA**:可安装到桌面/手机,离线缓存;Web Push 推送(后台收到消息弹通知)
- **会话短名**:班级会话显示 `15班` 而非完整 `2024级15班`;角色头像分色(班主任/教师/大屏/管理员)

## 👥 角色与权限

| 角色 | 说明 | 核心功能 |
| --- | --- | --- |
| 管理员 (admin) | 系统管理员 | 账号管理(新建/改角色/重置密码/删除)、班级管理(新建/改班主任/重置大屏密码/删除)、绑定管理、年级范围配置 |
| 班主任 (head_teacher) | 班级管理者 | 创建班级、生成邀请码、审核入班申请、移除成员、重置大屏密码、删除班级;也可申请加入其他班级 |
| 教师 (teacher) | 教师端 | 凭邀请码加入班级,与班级大屏实时单聊、发送文件 |
| 班级大屏 (screen) | 大屏展示端 | 随班级自动创建/删除;接收班级成员消息,成员变动实时同步展示;也可加入其他班级与其他大屏互发 |

> 大屏账号不由管理员手动建立,随班级生命周期自动生成/删除;管理员账号列表不展示大屏账号。

## 🛠 技术栈

- **服务端** `server/`:Node.js、Express 4、Socket.IO 4、mysql2(连接池+事务)、jsonwebtoken、bcryptjs、multer、web-push
- **前端** `client/`:Vue 3、Vite 5、Pinia、vue-router、socket.io-client、vite-plugin-pwa
- **数据库**:MySQL 8(utf8mb4),表:`users / classes / class_members / friendships / messages / push_subscriptions / settings`
- **文件存储**:Microsoft Graph(OneDrive 企业版,应用专用客户端凭据流)

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18(开发验证于 Node 24)
- MySQL 8(可本机或远程访问)

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`,至少填写:

```ini
# MySQL(建议为 chatroom 库创建专用账号,仅授权该库)
DB_HOST=你的MySQL地址
DB_PORT=3306
DB_USER=chatroom
DB_PASSWORD=你的密码
DB_NAME=chatroom

# JWT 密钥(生产务必改为长随机串)
JWT_SECRET=please-change-me
```

### 3. 一键初始化(建库建表 + 管理员 + 自动生成 .env / JWT_SECRET / VAPID)

```bash
npm run init
```

该命令自动完成五件事:

1. **生成 `.env`**:若不存在,从 `.env.example` 复制
2. **生成 `JWT_SECRET`**:若缺失或仍为占位值(`change-me-to-a-long-random-string`),自动写入 96 位随机密钥
3. **生成 VAPID 密钥对**(Web Push 推送):若 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 为空,自动生成并写入
4. **建库建表**:自动创建 `chatroom` 库与全部表(仅操作该库,幂等)
5. **创建管理员**:默认 `admin` / `admin123`(可用环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 覆盖)

> 注意:`.env` 已存在时不会被覆盖;已生成过真实密钥后再次 `npm run init` 不会重置它们(但会重置 admin 密码为默认值)。

### 4. 构建前端并启动

```bash
npm run build    # 首次/改前端后:构建前端到 client/dist
npm start        # 单端口全栈:静态托管 + API + Socket.IO,监听 :3000
```

浏览器打开 http://localhost:3000 即可登录(经 Cloudflare 映射的 HTTPS 域名亦直达同一服务,前端用相对路径,换域名零代码改动)。

### 默认账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `admin123` | 管理员(请立即修改) |

> 其余账号均由管理员在后台创建;大屏账号由创建班级时自动生成。本地演示数据脚本(`seed-demo.mjs`)未入库,可自行按需编写。

## ☁️ OneDrive 接入(文件存储)

1. [Azure 门户](https://portal.azure.com) →「应用注册」→「新注册」,受支持账户类型选「仅此组织目录」,重定向 URI 留空
2. 记录「应用程序(客户端)ID」→ `GRAPH_CLIENT_ID`;「目录(租户)ID」→ `GRAPH_TENANT_ID`
3. 「证书和密码」→「新客户端密码」,记录值(仅显示一次)→ `GRAPH_CLIENT_SECRET`
4. 「API 权限」→「添加权限」→「Microsoft Graph」→「应用程序权限」,勾选 `Files.ReadWrite.All`,并「授予管理员同意」
5. 在 `.env` 中指定目标账号与其 OneDrive 上传目录:

```ini
GRAPH_USER_UPN=your-user@your-org.onmicrosoft.com
GRAPH_FILES_ROOT=chatroom
# 或直接给 driveId:
# GRAPH_DRIVE_ID=
```

6. 重启后端即可。文件接口:`POST /api/files/upload`、`GET /api/files/download/:itemId`、`DELETE /api/files/:itemId`(均需登录;未配置时返回 503 及指引)。

> 文件按**月份目录**存储(如 `chatroom/2026-08/...`),文件名自动消毒,删除状态持久化,下载时校验已删除文件。

## 🔔 Web Push 通知(离线推送)

前端(PWA)自动注册 service worker 并请求订阅权限;收到消息时若接收者不在线,服务端推送系统通知(iOS Safari / 华为浏览器等走各自可达的推送端点;国内安卓 Chrome 走 FCM 不可达,引导使用华为浏览器)。

**密钥由 `npm run init` 自动生成**写入 `.env`(`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`);如需手动重新生成:

```bash
node server/scripts/gen-vapid.mjs   # 本地工具脚本,未入库
```

## 📦 常用脚本与启动模式

| 命令 | 模式 | 说明 |
| --- | --- | --- |
| `npm run init` | 初始化 | 一键:生成 `.env` + 随机 `JWT_SECRET` + VAPID 密钥对 → 建库建表 → 创建管理员 |
| `npm start` | **生产/单端口全栈** | 托管前端产物 + API + Socket.IO,监听 `:3000`(唯一对外启动方式) |
| `npm run build` | 构建 | 构建前端到 `client/dist`(改前端后执行) |
| `npm run seed:demo` | 开发 | 本地演示数据(脚本未入库) |
| `npm run gen:vapid` | 开发 | 本地生成 Web Push VAPID 密钥对(脚本未入库) |

**开发模式说明**

- 本项目无独立 dev 脚本:开发联调直接 `npm run build` + `npm start` 走单端口全栈即可,前端热更新需自行加 `vite` 并配置 `/api`、`/socket.io` 代理(`client/vite.config.js` 未内置代理)。
- 单独执行建表或建管理员(不常用):`node server/src/db/init.js`、`node server/src/seed.js`(二者均被 `npm run init` 按序包含)。

## 🌐 生产部署

**推荐:单端口全栈 + Cloudflare(零 Nginx)**（Nginx反代也不是不行）

后端 `server/src/index.js` 同时托管前端产物(`client/dist`)、API 与 Socket.IO,把域名 443/80 映射/反代到本服务端口即可,证书可由 Cloudflare 边缘承担(本项目不在 Node 内配置证书)。

1. 每次改前端后 `npm run build` 再重启后端
2. `npm start`(`node server/src/index.js`)
3. Cloudflare:DNS 记录开代理(橙色云),SSL/TLS 模式 Flexible 或 Full(strict);域名 443 映射到本机/服务器 `:3000`
4. 访问 `https://你的域名` 即完整站点(页面 + API + WebSocket)

**服务器注意事项**

- 只跑服务端:`npm install --omit=dev`(不装构建依赖),并上传开发机构建好的 `client/dist`
- 需在服务器上构建前端时全量安装;ARM64 服务器如报 rollup 相关 `ERR_MODULE_NOT_FOUND`,按发行版补平台二进制:
  ```bash
  npm install -D @rollup/rollup-linux-arm64-gnu    # Debian/Ubuntu(glibc)
  npm install -D @rollup/rollup-linux-arm64-musl   # Alpine(musl)
  ```
- 切勿把开发机(尤其 Windows)的 `node_modules` 直接拷贝到服务器(平台二进制不匹配)
- 部署命令/凭据等本地敏感脚本未入库(见 `.gitignore`)

**安全基线**

- 修改 `JWT_SECRET`、重置默认密码
- 生产 MySQL 使用专用低权限账号
- PWA 安装与 Web Push 要求 HTTPS(经 Cloudflare 访问即满足)

## 🗂 目录结构

前后端为单一 npm 项目(一个 `package.json` / 一个 `node_modules`):

```
server/                 # 后端
  src/index.js          # Express + Socket.IO 入口(静态托管 + API + WS)
  src/config.js         # 环境变量配置
  src/db/               # 连接池、建库建表脚本、schema.sql
  src/routes/           # auth / admin / classes / messages / files / push / settings
  src/middleware/       # JWT 认证与角色中间件
  src/socket/           # Socket.IO 握手鉴权、消息事件、班级房间广播
  src/services/         # onedrive(Graph)、push(web-push)
  scripts/              # 本地工具/演示脚本(未入库)
client/                 # 前端(Vue3 + Vite + PWA)
  src/views/            # 登录/会话/聊天/班级/管理/我的
  src/components/       # 会话列表、聊天窗口
  src/stores/           # Pinia:auth / chat
  src/api/              # fetch 封装、socket 封装
  src/utils/            # IndexedDB 缓存、上传、格式化
```

## ❓ 常见问题

**Q: 页面一直显示旧版,刷新也没用?**

缓存有三层,按序处理:
1. Cloudflare（若使用）面板 → Caching → **Purge Everything**
2. 浏览器 F12 → Application → Service Workers → **Unregister**,再 Clear site data
3. 确认后端已重启且 `client/dist` 为新产物

**Q: 管理员能登录,其他账号登录失败?**

确认账号角色与密码;忘记密码时管理员可在后台重置。

**Q: 国内安卓收不到后台推送?**

安卓 Chrome 的 Web Push 走 Google FCM(国内不可达)。请使用**华为浏览器**打开站点(其 Web Push 走华为 Push Kit,国内可达),前端已针对华为/荣耀设备显示引导提示。

**Q: 为什么服务器连不上 Apple 推送?**

服务器 IPv6 不可达时,Node 20+ 的 `autoSelectFamily` 会优先尝试 IPv6 导致 APNs 连接超时;本项目已内置强制 IPv4 的推送 Agent,正常无需处理。
