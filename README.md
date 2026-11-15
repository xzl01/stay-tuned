# 留频 · Stay Tuned

[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE) [![Source](https://img.shields.io/badge/source-GitHub-24292f.svg)](https://github.com/xzl01/stay-tuned) [![Static demo](https://img.shields.io/badge/demo-GitHub%20Pages-2ea44f.svg)](https://xzl01.github.io/stay-tuned/)

一档可以**订阅 RSS 播客**、也可以**调谐 M3U 网络电台**的播放器。PC 与移动端各有一套独立编排的界面，支持拟物 / 扁平两种质感和浅色 / 深色两种主题。

## 设计依据

后续界面工作从 [设计资料入口](docs/design/README.md) 与 [已确认设计约束](docs/design/constraints.md) 继续。最新方向为**章节与音量双推杆、小型反射式液晶屏**，可查看 [桌面端参考稿](docs/design/references/current/desktop-light-skeuomorphic.png) 和 [手机端参考稿](docs/design/references/current/mobile-light-skeuomorphic.png)。设计资料与下方现有实现截图分开保存；旧的旋钮、大屏和音量读数方案已被后续约束取代。

![桌面端 · 拟物 · 浅色](docs/screenshots/desktop-light.png)

<p align="center">
  <img src="docs/screenshots/mobile-light.png" alt="移动端 · 拟物 · 浅色" width="320" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/mobile-dark.png" alt="移动端 · 拟物 · 深色" width="320" />
</p>

---

## 功能

### 播客

- **RSS / Atom 订阅**：粘贴任意公开 RSS 地址即可解析节目、封面、单集、时长和 Show Notes。
- **订阅重命名**：导入的 RSS 订阅可以直接改名；自定义名称保存在本机，刷新订阅后不会被 feed 原标题覆盖。
- **订阅更新**：打开「我的订阅」时会自动尝试刷新超过 30 分钟未同步的订阅（每次最多 3 档），也可以点节目旁的刷新按钮手动更新；更新失败保留旧数据。
- **播客发现**：通过 Apple Podcasts 目录搜索节目，直接订阅对应的 RSS；把 RSS 链接直接粘进搜索框也会识别为「直接订阅」，不用先找「添加 RSS」。
- **单集播放**：断点续听（每个单集独立保存进度）、15 秒后退 / 30 秒前进、倍速、音量推杆、静音。
- **单集库**：展开节目查看完整单集列表，支持最新 / 最早排序，显示已听进度、已听完状态和日期信息。
- **播放队列**：顺序播放、加入队列、上下移动、移除、清空；一期结束后自动接上下一段。
- **章节与文字稿**：支持 Podcasting 2.0 的 `<podcast:chapters>` 和 `<podcast:transcript>`（VTT / SRT / JSON / 纯文本），也保留内置示例数据；拖动机身上的章节推杆可预览章节，松手跳转，文字稿中的句子也可直接点击。普通 RSS 的节目简介作为「简介」标签展示。
- **睡眠定时**：15 / 30 / 60 分钟，或「本集结束后暂停」。
- **收藏**：「我的订阅」中有独立的收藏标签页，收藏的播客单集和电台可以在这里统一播放或移除。
- **Media Session**：桌面媒体键、锁屏控制、系统播放/暂停/上一段/下一段。
- **跟随播放**：文字稿随声音自动滚动，可关闭。

### 电台

- **M3U 导入**：支持扩展 M3U（`group-title`、`tvg-logo`、`tvg-name`）、远程 URL 和**本地 `.m3u` 文件**。导入时可以给整份播放列表命名；如果列表只有一条流，名称会直接用作电台名，不再多套一层分组。之后在「我的电台」中可重命名播放列表，也可以点电台旁的铅笔单独改名；同样的位置还能上传本地图片或粘贴图片地址，自定义电台封面。此前已导入、仍带原始 M3U 来源的旧数据会自动归组；单条流的旧分组会自动收起，第一次打开后同样可以改名。
- **直接流地址**：自动识别 Icecast / SHOUTcast 等直接音频流，避免无限缓冲。
- **HLS**：通过 `hls.js` 播放 `.m3u8`；服务端会把 manifest 和分片重写为同源代理，绕开很多电台不返回 CORS 头的问题。
- **电台搜索**：基于 Radio Browser 目录搜索全球网络电台。
- **编辑精选**：首屏附带几个长期可用的公共电台（SomaFM、FIP、KEXP）。
- **实时调谐**：电台模式下采用 LIVE 读数和「不可拖动进度」的界面语义；桌面电台波形、手机直播卡片和底部实时信号线都由 Web Audio 分析当前音频驱动，是真实频谱。
- **频谱回退**：浏览器不支持 Web Audio、或音频源无法进入分析器时，自动保留原来的装饰性波形动画，不影响播放。

### 界面

- **两套 UI**：`≤1023px` 使用移动/平板编排（竖排、底部粘性传输栏、全屏底部抽屉）；更宽时使用桌面编排（横向收音机 + 节目侧栏 + 加宽控制条）。
- **拟物 / 扁平**：拟物模式保留奶油色 / 炭灰机身、精密孔阵、微凹推杆轨道、机身投影与实体按键；扁平模式沿用同一套小 LCD、双推杆和按键语义，以纯色与简洁线条表达。桌面端外观切换收在右上角的「外观设置」菜单里，手机端保留直给的拟物 / 扁平与明暗入口。
- **音量只由推杆位置表示**：机身和屏幕都不显示音量百分比、数字或额外电平条；章节推杆与底部连续播放进度条分工明确。
- **浅色 / 深色**：独立配色，随阅读环境切换。
- **纯本地**：订阅、队列、收藏、进度、主题均存在浏览器 `localStorage`，没有账号和后端数据库。真实章节 / 文字稿按需读取并只保存在当前会话内存中。
- **可安装 PWA**：生产构建包含 manifest 与离线 app shell service worker，可添加到桌面 / 主屏幕；界面可离线打开，RSS 与电台播放需要联网。

---

## 收音机 3D 彩蛋

在**拟物模式**下长按播放键 **5 秒**，Three.js 模型会在原位置替换收音机。桌面与手机的收音机播放键、下方主播放键均支持。首次进入页面不加载 Three.js、模型和专用样式；触发后才下载独立代码块。

按住半秒后显示提示和长按进度条。按钮内移动不会打断计时；明显移出按钮、松手或切到后台会取消。触控播放键会捕获当前手势，避免轻微移动被页面滚动打断。

模型支持拖动旋转、滚轮 / 双指缩放、查看背面、自动环绕与重置。实体推杆、按键和小屏幕连接当前播放、音量、章节及队列；原页面其他区域仍可操作。模型下方的“操作”面板提供键盘可用的滑块，不显示音量数字。

点击“退出 3D”或按 `Esc` 恢复原外观，释放画布、动画循环、事件监听和 GPU 资源；切到扁平模式同样退出。播放状态和进度保持连续。刷新页面后回到默认外观，再次长按才会启用。

## 快速开始

要求 **Node.js ≥ 20.19**（建议 22）。

```bash
npm ci
npm run dev
```

- 前端：<http://localhost:5173>
- API：<http://localhost:8787>

`npm run dev` 会同时启动 Node API（负责 RSS / M3U / 音频代理）和 Vite 前端。手机与电脑在同一局域网时，可以直接访问 `http://<电脑局域网 IP>:5173` 查看移动端 UI。

### 生产模式

```bash
npm run build
npm start
```

打开 <http://localhost:8787>。Node 服务会同时托管 `dist/` 静态文件与 `/api/*` 接口。

可用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | Node 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址；只想本机访问可设为 `127.0.0.1` |
| `CORS_ORIGINS` | 空（允许任意来源） | 逗号分隔的允许来源，例如 `https://app.example.com`；留空时返回 `*` |

### Android 应用

仓库内置 [Capacitor](https://capacitorjs.com/) 工程（`android/`），可以直接构建 APK：

```bash
npm ci
npm run android:sync   # 构建前端并同步到 android 工程
npm run android:apk    # 产出 android/app/build/outputs/apk/debug/app-debug.apk
```

本地构建需要 **Node.js 22**、**JDK 21**、**Android SDK（compileSdk 36 / build-tools 36）**。如果不希望配置本地环境，可以走 GitHub Actions：

| 方式 | 结果 |
| --- | --- |
| Actions → **Build Android APK** → Run workflow | 下载 `stay-tuned-apk` artifact（debug + release） |
| 推送 `v*` 标签（如 `git tag v1.0.0 && git push origin v1.0.0`） | 自动构建并附到 GitHub Release |

没有配置签名时，**debug APK 可以直接安装到手机**（使用调试签名）；`release-unsigned.apk` 不能直接安装，仅用于随后用你自己的密钥签名。

**签名**：`release` 构建默认产出未签名的 `app-release-unsigned.apk`。要生成可安装的正式包，在仓库 Secrets 中配置：

| Secret | 说明 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 base64（`base64 -w0 release.keystore`） |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

配置后 workflow 会自动签名 `app-release.apk`；缺少这些 Secrets 时仍会构建未签名包，不会失败。

**内置解析引擎**：APK 里打包了完整的解析层，`server/feed.mjs`、`playlist.mjs`、`extras.mjs`、`catalog.mjs` 等纯 ESM 模块被前端直接复用，网络请求通过 CapacitorHttp 走原生通道，因此**不需要任何服务端**：

| 能力 | 是否内置 |
| --- | --- |
| RSS / Atom 订阅与刷新 | ✅ |
| 播客搜索（Apple Podcasts） | ✅ |
| 电台搜索（Radio Browser） | ✅ |
| M3U / 本地 .m3u 文件导入 | ✅ |
| HLS 串流 | ✅ 交给 Android WebView 原生播放 |
| Podcasting 2.0 章节与文字稿 | ✅ |
| 封面 / 音频 | ✅ 由手机直接加载 |
| 实时频谱 | ⚠️ Android 上为装饰动画（见下） |

浏览器端仍然走 Node API（公共订阅源不返回 CORS 头）。如果想把手机的解析交给远端，可在「我的订阅」底部填一个服务端地址：填了之后会切回远程代理模式（音频也经代理，频谱因此始终可用）。

### 后台播放与耗电

- 媒体会话不再按固定间隔重建：只有标题、封面或播放状态变化时才更新通知与 `MediaMetadata`，其余更新只刷新 `PlaybackState`。
- 进度校准自适应：屏幕亮着时 15 秒一次，息屏 / 后台 60 秒一次；切歌、暂停、拖动进度时立即同步。息屏播放的媒体推送频率约为 **1 次/分钟**（旧实现为 12 次/分钟）。
- 播放进度渲染节流：`timeupdate` 从约 4 次/秒降到可见时 1 次/秒，息屏时不再更新 UI 状态。
- App 内不创建 Web Audio 图，音频直接由系统解码输出，避免额外的音频处理开销。

### 桌面小组件与系统媒体控制

APK 内置原生媒体会话与桌面小组件：

- **主屏小组件**（长按桌面 → 小组件 → 留频）：显示当前节目/电台与播放状态，提供上一集 / 播放暂停 / 下一集三个按钮；应用在前台可直接控制，不在前台时会拉起应用后执行。
- **媒体通知与系统面板**：播放时出现可拖动的媒体通知（`category=transport`），锁屏、通知栏、耳机按键、系统媒体面板都能控制播放；HyperOS 的媒体焦点区域（灵动岛式展示）读取的也是这个会话。
- **订阅备份**：「我的订阅」底部 → 备份 / 同步，可把订阅、收藏、进度导出为 JSON 文件（安卓写入 Documents 并拉起分享），在另一台设备用「合并」或「替换」导入。

调试签名已固定为仓库内的 `android/keystore/debug.keystore`（密码 `staytuned`），本地构建与 CI 产物可以互相覆盖安装，不会再出现签名冲突。

### GitHub Pages 静态演示

仓库包含 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)，推送到 `main` 后会自动构建并部署到：

**<https://xzl01.github.io/stay-tuned/>**

GitHub Pages 只能托管静态文件，因此该部署是**静态演示版**：

- 内置示例播客、章节、文字稿和示例音频可以播放
- 示例电台的直链音频可以尝试直接播放；HLS/跨域代理不保证可用
- RSS 订阅、播客/电台搜索、M3U 导入、刷新、远程章节/文字稿等依赖 Node API 的功能会提示静态演示限制
- 所有数据仍只保存在浏览器本地

完整功能请在本机执行 `npm run dev` 或部署 Node 服务。Pages 构建使用 `VITE_BASE=/stay-tuned/` 和 `VITE_STATIC_DEMO=1`，并已适配子路径、PWA manifest 与 service worker scope。

### 测试

```bash
npm test          # 服务端 RSS / M3U / HLS 解析单元测试
npm run license:check  # 依赖许可证合规检查
npm run build     # TypeScript 类型检查 + 生产构建
```

---

## 使用指南

### 订阅一档播客

1. 点击右上角「我的订阅」。
2. 点击「添加 RSS」，粘贴 RSS 地址；或直接把 RSS 链接粘进搜索框，在「直接订阅这个 RSS」卡片里点订阅；也可以搜索播客名称后订阅。
3. 点开节目 -> 点单集即开始播放。播放器会记住你听到的位置。

### 导入 M3U 电台

1. 「我的订阅」-> 切到「电台」。
2. 点「导入 M3U」，粘贴 `.m3u` 链接，或点「从本地 .m3u 文件导入」。
3. 播放列表里的电台会加入你的电台列表；也可以只点「试听」立即收听。

本地示例播放列表：[`public/demo/stations.m3u`](public/demo/stations.m3u)。

### 快捷键（桌面）

| 按键 | 行为 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `←` / `→` | 后退 15 秒 / 前进 30 秒 |
| `M` | 静音 / 取消静音 |
| `L` | 打开我的订阅 |
| `Q` | 打开播放队列 |
| `D` | 切换浅色 / 深色 |
| `Esc` | 关闭抽屉 |

---

## 技术结构

```
.
├── server/
│   ├── index.mjs          Express API + 生产静态托管
│   ├── feed.mjs           RSS 2.0 / Atom 解析与规范化
│   ├── extras.mjs         播客章节与文字稿解析
│   ├── playlist.mjs       M3U / M3U8 / 直接音频流导入
│   ├── hls.mjs            HLS manifest URI 重写
│   ├── http.mjs           统一远程请求、超时与 ID 生成
│   └── parsers.test.mjs   Node 原生 test runner
├── src/
│   ├── App.tsx            应用外壳、主题、快捷键、抽屉状态
│   ├── components/
│   │   ├── DesktopPlayer.tsx
│   │   ├── MobilePlayer.tsx
│   │   ├── Receiver.tsx   拟物/扁平收音机与双推杆
│   │   ├── CurrentChapterRow.tsx
│   │   ├── ChaptersSheet.tsx
│   │   ├── EpisodePanel.tsx
│   │   ├── Transport.tsx
│   │   ├── LibrarySheet.tsx
│   │   ├── QueueSheet.tsx
│   │   ├── CoverArt.tsx   内置 SVG 封面插画
│   │   ├── hardware/      Fader、Lcd 等实体控件
│   │   └── ui/            抽屉、开关、弹出菜单、Toast
│   ├── state/AppStore.tsx 播放器 + 库 + 队列 + 偏好状态
│   ├── data/seed.ts       示例订阅、示例节目与章节/逐字稿
│   ├── lib/               API、格式化、持久化、封面
│   └── styles/            设计令牌与分模块样式
├── android/               Capacitor Android 工程（WebView 外壳 + 启动图标）
├── public/
│   ├── audio/             本地生成的示例环境声（可自由替换）
│   ├── fonts/             自托管 Maple Mono
│   ├── textures/          浅色拟物上盖曲面材质切片
│   ├── demo/              示例 M3U
│   └── icon.svg / manifest.webmanifest
└── docs/screenshots/
```

### 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/feed?url=&refresh=1` | 抓取并解析 RSS / Atom；`refresh=1` 绕过短缓存 |
| `GET` | `/api/chapters?url=` | 代理并解析 Podcasting 2.0 章节 JSON |
| `GET` | `/api/transcript?url=&type=` | 代理并解析 VTT / SRT / JSON / 文本文字稿 |
| `GET` | `/api/playlist?url=` | 抓取 M3U / HLS / 直接流 |
| `POST` | `/api/playlist/parse` | 解析浏览器读取的本地 M3U 文本 |
| `GET` | `/api/podcast/search?q=` | Apple Podcasts 目录搜索 |
| `GET` | `/api/radio/search?q=` | Radio Browser 电台搜索 |
| `GET` | `/api/radio/featured` | 内置精选电台 |
| `GET` | `/api/audio?url=` | 音频代理（支持 Range） |
| `GET` | `/api/hls?url=` | HLS manifest 重写 / 分片代理 |
| `GET` | `/api/image?url=` | 封面代理与缓存 |
| `GET` | `/api/health` | 健康检查 |

服务端对音频请求转发 `Range` 头，因此进度拖动仍然可用。所有解析结果在内存中短时缓存，减少对 RSS 源和电台目录的重复请求。

---

## 关于示例内容

首次打开会附带三档虚构播客（「日常之间」「山谷来信」「胶片与咖啡」）和四个公共电台，目的是让界面与播放链路开箱可用：

- 示例音频是用 ffmpeg 生成的安静环境声，托管在 `public/audio/`，不是真实节目录音。
- 示例封面是代码生成的 SVG 插画。
- 精选电台来自 SomaFM、Radio France（FIP）、KEXP 的公开串流，版权归各电台所有。
- 「日常之间 EP.128」的章节与文字稿是为演示界面编的；点击「取消订阅」可移除全部示例内容。

订阅真实播客后，节目简介、章节/逐字稿取决于该 RSS 是否提供对应数据；当前版本不额外生成 AI 文字稿。

---

## 已知边界

- 这是一个**本地优先的单用户应用**：没有账号、云同步或跨设备进度合并。
- Android 应用内置解析引擎，无需服务端；浏览器端仍需要 Node 服务作为跨域代理。
- 电台频谱：桌面浏览器（经本机代理，同源）显示真实频谱；Android 应用固定使用装饰动画——App 内不会创建 Web Audio 图，否则会接管音频输出并导致 Android 上只剩进度、没有声音。Android WebView 会对带 `crossorigin` 的媒体强制 CORS，多数真实电台和局域网媒体服务器不返回该响应头，一旦以 CORS 模式请求就无法播放，因此 App 内一律按普通方式加载，优先保证可播。
- Android 工程的 WebView 源是 `http://localhost`，便于直接播放局域网 http 媒体；从 1.1.x 升级时，旧来源下的本地订阅属于另一个 origin，需要重新订阅一次。
- APK 面向 Android 7.0+（minSdk 24）；未签名的 release 包不能直接安装，需要按上文配置签名。
- 音频直链、封面和 RSS 都由本机 Node 代理转发；如果把服务暴露到公网，请自行增加鉴权、限流和 SSRF 防护。
- HLS 依赖 `hls.js`；Safari 原生 HLS 也会被代理转发。
- 某些播客源会拒绝非浏览器 UA 或要求地区访问，这是源站策略。
- 订阅刷新目前在打开订阅抽屉时自动尝试，没有后台定时任务或 Podping 推送；电台 HLS 断流暂不自动重连。
- 真实章节 / 文字稿需要节目提供 Podcasting 2.0 标签；ID3 内嵌章节和视频播客尚未解析。
- 音频下载 / 离线收听尚未实现；Service Worker 只缓存界面壳，不缓存音频。
- 播放进度只在页面隐藏时同步刷盘，并由播放中每 ~7 秒写一次；强制关闭页面可能丢失最后几秒进度。

---

## 字体与素材

- [Maple Mono](https://github.com/subframe7536/maple-font)（SIL OFL），自托管于 `public/fonts/`；授权全文见 [`third-party-licenses/maple-mono-OFL-1.1.txt`](third-party-licenses/maple-mono-OFL-1.1.txt)。
- 收音机 LCD 使用 [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font) 中文点阵字体（SIL OFL，`2026.11.10` 原版），自托管于 `public/fonts/fusion-pixel/`；授权文件与上游附带声明一并保留。
- 中文使用系统字体：Noto Sans CJK / PingFang SC / Microsoft YaHei 回退。
- 示例封面、品牌图标、收音机控件、波形与动效沿用项目内的 CSS / SVG；拟物上盖与前面板共用同一尺寸、同一坐标的材质渐变，避免独立切片及滤色产生接缝色差。液晶文字和双推杆均为真实、可操作的界面，不烘焙进背景图片。
- [本轮拟物细节校验](design-qa.md) 与 [实际界面截图](docs/screenshots/hardware-refinement-2026-11-14/desktop-skeuo-light.png) 记录了双推杆、小液晶屏和机身材质的还原情况。

---

## 开源许可

本项目以 **GNU General Public License v3.0 only**（`GPL-3.0-only`）发布，版权归 2026 HarryLoong 及贡献者所有。

- [LICENSE](LICENSE)：GPL-3.0 完整许可证文本
- [NOTICE](NOTICE)：版权、来源与商标说明
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：运行时依赖、Three.js、字体和素材的来源与许可证
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献流程与 DCO（Developer Certificate of Origin）

第三方组件、字体和素材不因本项目采用 GPL 而被重新授权，它们继续适用各自许可证。项目内的示例音频、封面、设计参考图和截图是项目生成或整理的内容，随项目一并按 GPL-3.0-only 发布；详见 `THIRD_PARTY_NOTICES.md`。

如果分发 APK、桌面安装包或其他预构建二进制，需要按 GPLv3 的要求向接收者提供对应源码及构建说明。本项目按“现状”提供，不附带任何担保。

---

## 更多界面

| | |
| --- | --- |
| ![桌面端 · 拟物 · 深色](docs/screenshots/desktop-dark.png) | ![桌面端 · 扁平 · 浅色](docs/screenshots/desktop-flat-light.png) |
| 桌面端 · 拟物 · 深色 | 桌面端 · 扁平 · 浅色 |
| ![桌面端 · 电台模式](docs/screenshots/desktop-radio.png) | ![桌面端 · 扁平 · 深色](docs/screenshots/desktop-dark-flat.png) |
| 桌面端 · 电台实时模式 | 桌面端 · 扁平 · 深色 |
