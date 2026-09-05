# Wisp

[![CI](https://github.com/VaneEcho/wisp/actions/workflows/ci.yml/badge.svg)](https://github.com/VaneEcho/wisp/actions/workflows/ci.yml)

一次性聊天室，自己部署。不注册、无数据库、不落盘——起个昵称进房就能聊，人走房间就没了。

- 房间就是一个链接（`?room=名字`），直接开裸链接会随机开房，把地址发给别人就是邀请
- 房间可以设密码
- 实时消息、正在输入提示、在线列表
- 图片和文件走 socket 转发，**从不写入磁盘**
- 默认不留历史；需要的话可以开一个有上限的内存缓存（`CACHE_SIZE`）
- 浅色 / 深色 / 跟随系统
- 单个 Node 进程，无数据库、无 Redis、无外部依赖

## 跑起来

```sh
docker run -d --name wisp -p 8090:8080 ghcr.io/vaneecho/wisp:latest
```

打开 `http://localhost:8090` 即可。或者用 [`compose.yaml`](./compose.yaml)：

```sh
docker compose up -d
```

## 放到反向代理后面

客户端总是连它自己被加载出来的那个源，所以 nginx / Caddy / Traefik / Cloudflare 都能直接用，只要透传 WebSocket 升级——这几个默认都透传。

**代理后面记得开 `TRUST_PROXY_HEADER=true`**，否则登录限流只看得到代理的 IP，会把所有用户算成同一个。开启后只取 `X-Forwarded-For` 的最后一项（代理追加的才是真实地址，左边是客户端自己填的），因此它假设你前面**只有一层**可信代理。直接暴露在公网时保持关闭，否则谁都能伪造。

## 配置

全部有默认值，一个都不填也能跑。都是环境变量（非 Docker 运行时也认项目根目录的 `.env`）。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | Docker 里 `8080`，否则 `8090` | 监听端口 |
| `CACHE_SIZE` | `0` | 每个房间为后进者保留的文本消息数（服务端钳制在 0–500）。文件和图片从不缓存 |
| `TRUST_PROXY_HEADER` | `false` | 见上 |
| `MAX_NICK_LENGTH` | `32` | 昵称长度上限 |
| `MAX_MESSAGE_LENGTH` | `4000` | 单条文本长度上限 |
| `MAX_ROOM_LENGTH` | `64` | 房间 ID 长度上限 |
| `MAX_MESSAGES_PER_WINDOW` | `5` | 每连接每窗口允许的消息数 |
| `MAX_TYPING_PER_WINDOW` | `20` | 每连接每窗口允许的"正在输入"事件数 |
| `MESSAGE_WINDOW_MS` | `5000` | 上面两项的窗口长度（毫秒） |
| `MAX_LOGIN_ATTEMPTS_PER_WINDOW` | `10` | 每 IP 每窗口的登录尝试次数，用来挡房间密码爆破 |
| `LOGIN_WINDOW_MS` | `60000` | 登录限流窗口（毫秒） |
| `MAX_HTTP_BUFFER_SIZE_MB` | `10` | Socket.IO 单包上限，等于文件/图片的大小上限 |

## 安全边界

服务端要转发消息，所以**看得到全部明文**。套 TLS 只是传输层加密，**不是端到端加密**。

内存里存的：当前在线用户的昵称与房间归属；`CACHE_SIZE > 0` 时每个房间最近的几条文本。房间空了就连房间带缓存一起删除，进程重启同理。

磁盘上什么都不存——图片和文件是直接在客户端之间转发的。

服务端会校验所有 socket 输入（昵称、消息、房间 ID），对消息、"正在输入"和登录分别限流，每个响应都带 CSP 和常规安全头，Docker 里以非 root 运行。`GET /healthz` 供容器健康检查，只返回 `{"status":"ok"}`。

## 开发

需要 Node.js 24。

```sh
npm install
npm run check   # lint + 测试
npm start
```

## 许可与致谢

GPL-3.0，与上游一致，见 [`LICENSE`](./LICENSE)。

原作者 [m1k1o](https://github.com/m1k1o)，本 fork 维护在 [VaneEcho/wisp](https://github.com/VaneEcho/wisp)。

二维码用的是 [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（Kazuhiko Arase，MIT），以静态文件内置，完全在客户端运行，不依赖网络。
