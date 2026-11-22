# 鸿蒙（HarmonyOS / OpenHarmony）构建

留频的鸿蒙版是一个 **ArkWeb 壳**：界面、播放、状态全部沿用现有 Vite 产物，原生侧只负责窗口、Web 容器和权限。思路与 Android 的 Capacitor 外壳一致，但鸿蒙工程用 ArkTS 直接编写，不引入 Capacitor。

当前状态：**可以构建出 17 MB 的未签名 HAP**，`bundleName` 为 `io.github.xzl01.staytuned`，API 20。

## 为什么用 ArkWeb 壳

- 一套 UI 同时服务桌面、安卓和鸿蒙，不必为鸿蒙重写状态层。
- 拟物收音机、双推杆、小 LCD 都是 CSS 与 DOM，ArkWeb 渲染结果与浏览器一致。
- 订阅、队列、收藏、进度都存在 `localStorage`，鸿蒙侧无需额外存储代码。

## 目录结构

```text
harmony/
├── AppScope/
│   ├── app.json5                 应用标识、版本、图标
│   └── resources/base/           app_name、图标
├── build-profile.json5           产品与 SDK 版本（compileSdk / compatible / target）
├── hvigorfile.ts                 工程级 hvigor 任务
├── hvigor/hvigor-config.json5    hvigor 运行时配置
├── oh-package.json5              工程元信息
└── entry/
    ├── build-profile.json5       模块构建配置
    ├── hvigorfile.ts             模块级任务（hapTasks）
    ├── oh-package.json5
    └── src/main/
        ├── module.json5          入口 ability、设备类型、权限
        ├── ets/entryability/EntryAbility.ets
        ├── ets/pages/Index.ets   Web 容器
        └── resources/
            ├── base/{element,media,profile}
            └── rawfile/www/      ← npm run harmony:sync 生成
```

`rawfile/www` 是构建产物，不进版本库；`harmony/entry/build/`、`harmony/.hvigor/` 同理。

## 一次性环境准备

### 1. JDK 17+

打包 HAP 需要 `java`。macOS 自带的 `/usr/bin/java` 只是提示安装的桩程序，必须装真 JDK：

```bash
curl -L -o /tmp/jdk17.tar.gz \
  "https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jdk/hotspot/normal/eclipse?project=jdk"
mkdir -p ~/jdk && tar xzf /tmp/jdk17.tar.gz -C ~/jdk
export JAVA_HOME=~/jdk/jdk-17.0.21.1+2/Contents/Home   # macOS 的 .app 布局带 Contents/Home
```

`scripts/harmony-build.mjs` 会先读 `JAVA_HOME`，再尝试 `/usr/libexec/java_home`。

### 2. OpenHarmony SDK（API 20）

```bash
mkdir -p ~/ohos-sdk && cd ~/ohos-sdk
curl -O https://repo.huaweicloud.com/openharmony/os/6.0-Release/ohos-sdk-mac-public.tar.gz
tar xzf ohos-sdk-mac-public.tar.gz        # → sdk/packages/ohos-sdk/darwin/*.zip
shasum -a 256 ohos-sdk-mac-public.tar.gz  # 与同目录 .sha256 比对
```

hvigor 6.x 要求**按 API 版本分层**的目录：`<root>/<api>/ets`，而不是旧版平铺的 `<root>/ets`。把每个组件解到 `20/` 下：

```bash
cd ~/ohos-sdk && mkdir -p root/20
for zip in sdk/packages/ohos-sdk/darwin/*.zip; do
  unzip -q -o "$zip" -d root/20
done
ls root/20        # ets js native previewer toolchains
export OHOS_BASE_SDK_HOME=~/ohos-sdk/root
```

注意：

- 官方 mac 包只提供 **darwin-x64** 组件，Apple Silicon 依赖 Rosetta 2 运行工具链（`softwareupdate --install-rosetta` 可安装）。
- 解压后约 4 GB（native 组件占 2.9 GB），为 SDK 预留的空间应不少于 6 GB。
- 五个组件必须齐全，否则 hvigor 会尝试联网下载并报“SDK 许可未接受”。

## 构建

```bash
export OHOS_BASE_SDK_HOME=~/ohos-sdk/root
export JAVA_HOME=~/jdk/jdk-17.0.21.1+2/Contents/Home

npm install
npm run harmony:sync        # 构建前端（相对路径 base）并复制到 rawfile/www
npm run harmony:hap         # 产出 harmony/entry/build/default/outputs/default/entry-default-unsigned.hap
```

`harmony:sync` 做了两件浏览器构建不需要的事：

1. 用 `--base ./` 生成相对资源路径，`resource://rawfile/` 下才能找到 JS/CSS。
2. 丢弃 `sw.js`——该协议没有可注册的 service worker。

可选参数：`npm run harmony:sync -- --server http://192.168.1.20:8787` 会额外写入
`native-config.js`，首次安装就把“解析引擎”指向你的服务端，省去手动输入。

`harmony:hap` 首次运行会把 `@ohos/hvigor` 与 `@ohos/hvigor-ohos-plugin`（默认 6.26.20，可用 `HVIGOR_VERSION` 覆盖）装进 `.harmony-tools/`，之后复用；hvigor 缓存也留在那里，不污染用户目录。


打包完成后可以单独校验产物：

```bash
npm run harmony:verify -- harmony/entry/build/default/outputs/default/entry-default-unsigned.hap
```

检查项：包内关键条目的存在、`rawfile/www` 是否有前端资源、`index.html` 是否使用相对路径、`module.json` 的版本是否与 `package.json` 一致、四个权限与卡片扩展是否齐全。CI 的 `Build HarmonyOS HAP` 也在上传前跑同一条命令。
## 在 Linux 构建机上编译

macOS 上只能拿到 darwin-x64 工具链，需要 Rosetta；x86_64 Linux 构建机可以直接跑原生工具链，速度也更快。以下流程已在 **Arch Linux x86_64 + JDK 21 + Node 26** 上实测通过（构建产物与本地 macOS 构建同为 17 MB HAP，内容一致）。

```bash
# 1. 代码
git clone --depth 1 https://github.com/xzl01/stay-tuned.git ~/stay-tuned-build
cd ~/stay-tuned-build

# 2. SDK（2.4 GB 下载，解压后约 4 GB）
mkdir -p ~/ohos-sdk && cd ~/ohos-sdk
curl -sS -L -o ohos-sdk-windows_linux-public.tar.gz \
  https://repo.huaweicloud.com/openharmony/os/6.0-Release/ohos-sdk-windows_linux-public.tar.gz
mkdir -p extract root/20 && tar xzf ohos-sdk-windows_linux-public.tar.gz -C extract
find extract -name '*-linux-*.zip' -print0 | while IFS= read -r -d '' zip; do
  unzip -q -o "$zip" -d root/20          # 注意：Linux 包解压为 linux/*.zip
done
rm -rf extract

# 3. 构建
cd ~/stay-tuned-build
npm ci
export OHOS_BASE_SDK_HOME=~/ohos-sdk/root
export JAVA_HOME=$(dirname $(dirname $(readlink -f $(command -v java))))
npm run harmony:sync && npm run harmony:hap
```

产物路径：`harmony/entry/build/default/outputs/default/entry-default-unsigned.hap`。取回本机：

```bash
scp xzl@<构建机>:/home/xzl/stay-tuned-build/harmony/entry/build/default/outputs/default/entry-default-unsigned.hap \
  harmony-dist/stay-tuned-<版本>-unsigned.hap
```

注意点：

- `JAVA_HOME` 必须是**真正的 JDK**（脚本会读环境变量，其次尝试 `/usr/libexec/java_home`）。JDK 17 与 21 均可。
- hvigor 首次运行会从 HarmonyOS registry 安装到仓库内的 `.harmony-tools/`（约 330 MB），之后复用。
- 构建机不需要安装 DevEco Studio。

## 签名与安装

当前产物是**未签名 HAP**，只能用于验证构建，不能直接安装：

```text
hvigor WARN: No signingConfig found for product default
```

要装到真机，用 DevEco Studio 打开 `harmony/`，在 *File → Project Structure → Signing Configs* 登录华为账号自动生成调试证书，再把生成的 `signingConfigs` 写回 `harmony/build-profile.json5`。签名材料同样适用仓库的 `*.p12` / `*.jks` 忽略规则。

## 已知限制

| 项目 | 现状 |
| --- | --- |
| 界面与本地示例内容 | 完整可用，示例音频随包（`rawfile/www/audio`） |
| RSS 订阅 / 播客与电台搜索 / M3U 导入 | 由 ArkTS 网络桥 `StayTunedHttp` 直连（见下节），无需服务端；仍需真机验证 |
| 本地文件（.m3u 导入、备份导入导出、电台封面上传）| `onShowFileSelector` + `DocumentViewPicker` / `DocumentSavePicker`（见「文件选择与保存」）；仍需真机验证 |
| 外部链接与下载 | `onLoadIntercept` 拦下非 `resource://` 的 http(s) 跳转，用 `startAbility({action: 'ohos.want.action.viewData'})` 交给系统浏览器；`onDownloadStart` 同样转交，避免点了没反应 |
| 音频播放 | 走 ArkWeb 的 HTML5 音频；HLS 由 `hls.js`（MSE）处理。暂停后音源失效会在下次播放时自动重连（与桌面端同一套恢复逻辑） |
| WebView 崩溃/回收 | `onRenderExited` 自动重载 `resource://rawfile/www/index.html`，不会停在白屏 |
| 主题跟随系统 | ArkWeb 不保证 `prefers-color-scheme`；由 `EntryAbility.onConfigurationUpdate` → `AppStorage` → `StayTunedChrome.applySystemDark` 主动下发给页面 |
| 页面加载失败 | `onErrorReceive` 主框架失败时显示原生兜底层（错误信息 + 重试），不再只剩白屏 |
| 实时频谱 | 依赖 Web Audio 分析器，ArkWeb 支持情况需真机验证 |
| 触感反馈 | `StayTunedHaptics` → `@kit.SensorServiceKit`；沿用在安卓调过的 cue 表，timings 转成 `VibratorPattern` 的连续事件，振幅按 1-255 → 0-100 映射；仍需真机验证 |
| 窗口外观 | 边到边铺满 + 状态栏/导航栏图标随主题切换（`EntryAbility` + `StayTunedChrome`）；页面用 `env(safe-area-inset-*)` 自行避让 |
| Media Session / 锁屏控制 | 已由 AVSession 接管：标题/作者/状态/进度可见，播放暂停与前后切换可回灌页面；锁屏封面用 `AVMetadata.mediaImage`（远程 URL 或 `data:` 图片解码成 PixelMap，按条目缓存并在切换时释放） |
| 后台播放 | 已申请 `ohos.permission.KEEP_BACKGROUND_RUNNING`，播放期间开启 AUDIO_PLAYBACK 长时任务，并用 AVSession 接收锁屏 / 耳机按键；仍需真机验证 |
| 桌面服务卡片 | 信息卡 + 上一集 / 播放暂停 / 下一集三键（点击打开应用并回传动作）；卡片封面尚未做，见「桌面服务卡片」 |
| 3D 彩蛋 | 依赖 WebGL，需真机验证 |

## 网络桥

ArkWeb 没有 Capacitor 的 `CapacitorHttp`，而播客源普遍不返回 CORS 头。工程用 `registerJavaScriptProxy` 把 ArkTS 的 `@kit.NetworkKit` 暴露成页面里的 `window.StayTunedHttp`：

```text
ArkTS  harmony/entry/src/main/ets/common/HttpBridge.ets   StayTunedHttp.request(url, method, headersJson, body) → JSON 字符串
JS     src/lib/engine/harmony.ts                          harmonyTransport：把上面的 JSON 包装成 fetch 兼容的 Response
```

契约：`request` 返回 `{ status, headers, body, error? }` 的 JSON 字符串；`body` 以文本返回（订阅源、M3U、章节、文字稿都是文本，音频由 `<audio>` 直接加载，不走这条通道）。

接入点是既有的 `setFetchTransport`：

- 页面检测到 `window.StayTunedHttp` 后，`isNativePlatform()` 返回 true，应用按“无服务端”模式运行，与安卓一致；
- `src/lib/engine/local.ts` 优先选 Capacitor 传输，其次鸿蒙传输，最后退回浏览器 `fetch`；
- 因此在鸿蒙上订阅、搜索、M3U 导入、章节与文字稿都走原生请求，不受 CORS 限制，也不需要填写服务端地址。

若将来要在鸿蒙上改用远端服务端（例如自建代理），在「设置 → 解析引擎」填地址即可覆盖本地引擎。

## 后台播放与媒体会话

音频仍然由页面里的 <audio> 播放（ArkTS 不碰解码），ArkTS 负责系统侧的两件事：别把 WebView 冻结、让系统看见正在播放什么。

```text
页面  src/lib/engine/harmonyMedia.ts   →  window.StayTunedMedia.update(json)
                                          title / artist / playing / position / duration / speed
ArkTS harmony/.../common/MediaHost.ets  ├─ startBackgroundRunning(AUDIO_PLAYBACK)  播放时
                                         ├─ stopBackgroundRunning()               暂停时
                                         └─ AVSession.setAVMetadata / setAVPlaybackState
AVSession 回调 ─► controller.runJavaScript ─► window.__stayTunedMediaCommand('play'|'pause'|'next'|'prev'|'seek', 秒)
```

要点：

- 只有页面报告 `playing: true` 才开启长时任务，暂停即关闭，不会长期占用后台配额。
- 页面侧上报做了节流：状态变化立即发送，位置最多 1 秒一次。
- 传输命令是回灌给页面的：播放 / 暂停 / 上一集 / 下一集 / 进度都走现有 store，与界面按钮同一条路径，不会出现两套状态。
- 尚未实现：锁屏封面（AVSession 需要 PixelMap，页面只有 SVG 封面）、播放列表浏览、倍速同步到系统。

## 文件选择与保存

ArkWeb 默认不处理 `<input type="file">`，所以本地 `.m3u` 导入、订阅备份导入、电台封面上传在鸿蒙上原本是“点了没反应”。现在：

| 用途 | 实现 |
| --- | --- |
| 选择文件 | `Web().onShowFileSelector` → `picker.DocumentViewPicker`，后缀过滤由元素上的 `accept` 推导（图片 / 备份 / 播放列表） |
| 保存文件 | `StayTunedFiles.saveText(name, text)` → `picker.DocumentSavePicker` + `fileIo` 写入；页面侧 `src/lib/engine/harmonyFiles.ts` 判断桥是否存在 |
| 备份导出 | `src/lib/backup.ts`：鸿蒙走保存选择器，安卓保持 Documents + 分享面板，其他平台仍是浏览器下载 |

用户取消选择时 `handleFileList([])` 会让 `<input>` 保持空值；导出取消则返回空路径，界面提示“已取消导出”。

## 桌面服务卡片

安卓有主屏小组件，鸿蒙对应的是服务卡片：

| 文件 | 作用 |
| --- | --- |
| `harmony/entry/src/main/resources/base/profile/form_config.json` | 卡片定义（2*4、默认卡片、定期刷新兜底） |
| `harmony/entry/src/main/ets/widget/StayTunedCard.ets` | 卡片 UI：品牌行 + 当前节目 + 作者 + 播放状态，点按经 `postCardAction` 打开应用 |
| `harmony/entry/src/main/ets/entryformability/EntryFormAbility.ets` | `FormExtensionAbility`：创建时读快照、记录 formId、移除时清理 |
| `harmony/entry/src/main/ets/common/MediaHost.ets` | 播放状态变化时把快照写进 `preferences` 并调用 `formProvider.updateForm` |

数据流：

```text
页面 StayTunedMedia.update(json) → MediaHost
    ├─ preferences('stay_tuned_now')   ← 标题 / 作者 / 播放状态
    └─ formProvider.updateForm(formId, …) → 卡片进程读取并重绘
```

卡片运行在独立进程，所以只能通过 `preferences` 交换数据；`form_config.json` 里的 `updateEnabled` 只是兜底刷新，真正的更新由播放状态变化驱动。

- **卡片上的三键**：`⏮ / ⏯ / ⏭` 各自 `postCardAction({ action: 'router' })` 带 `stayTunedAction: 'prev' | 'toggle' | 'next'` 打开 `EntryAbility`，Ability 写进 `AppStorage`，页面用 `@StorageLink` + `@Watch` 消费一次并转给媒体桥（命令在页面就绪前会排队）。音频在 WebView 里，卡片进程无法直接控制，所以这条路是「打开应用并执行」，与安卓小组件在应用未运行时的行为一致。
尚未实现：卡片封面（需要把 PixelMap 交给卡片进程，或改用 `mediaImage` 的 URI 形式）。


### 图标与启动页

- 应用图标使用 `build/icon.png`（1024×1024），同时作为 `startWindowIcon`；此前沿用的是安卓 192 px mipmap。
- `resources/dark/element/color.json` 提供暗色的 `start_window_background`，夜间启动不会先闪一块奶白。
## 真机验证清单

设备接上后按这张表过一遍，失败时先看对应的 hilog TAG（`hdc shell hilog | grep StayTuned`）。

| # | 场景 | 预期 | 失败时看 |
| --- | --- | --- | --- |
| 1 | 安装后首次启动 | 启动图背景不闪白，随后进入播放器 | `StayTuned` / `onRenderExited` |
| 2 | 启动页深浅色 | 系统深色时启动背景为炭灰，浅色为奶白 | `resources/dark` 资源 |
| 3 | 播放示例内容 | 有声、可拖进度、倍速生效 | `StayTunedMedia` |
| 4 | 订阅真实 RSS | 能拉到节目与单集（不需要填服务端） | `StayTunedHttp` |
| 5 | HLS 电台 | 能出声音（ArkWeb 的 MSE 支持决定成败） | `StayTunedHttp` / 页面控制台 |
| 6 | 暂停 5 分钟后回前台 | 点播放能续上，不报「无法播放」 | 页面 `audio` 状态 |
| 7 | 切后台播放 | 长时任务生效，息屏不中断 | `background task started` |
| 8 | 锁屏 / 控制中心 | 标题、作者、封面、进度正确，播放暂停可用 | `AVSession` / `setAVMetadata` |
| 9 | 耳机按键 / 蓝牙 | 播放暂停与切歌回灌页面 | `__stayTunedMediaCommand` |
| 10 | 桌面卡片 | 添加后显示当前节目，三键可用，状态随播放刷新 | `StayTunedForm` / `card sync` |
| 11 | 卡片冷启动 | 应用未运行时点播放键，打开后立即开始播放 | 命令队列（`onPageEnd` 回放） |
| 12 | 触感 | 推杆有刻度感、按键有回弹，跟随系统开关 | `StayTunedHaptics` |
| 13 | 跟随系统主题 | 切系统深浅色，界面即时跟随 | `systemDark` |
| 14 | 本地 `.m3u` 导入 | 弹出系统文件选择器并能导入 | `StayTunedFiles` / 选择器 |
| 15 | 备份导出 | 弹出保存选择器，文件内容为 JSON | `FilesHost.saveText` |
| 16 | 电台封面上传 | 能选图并生效 | 选择器后缀过滤 |
| 17 | 设置里的「下载更新」 | 跳转到系统浏览器打开 GitHub Releases | `onLoadIntercept` |
| 18 | 实时频谱 | 电台模式有真实频谱（否则是装饰动画，可接受） | 页面控制台 |
| 19 | 5 秒长按彩蛋 | 3D 模型出现且可旋转 | WebGL 能力 |

已知需要现场决定的两处：卡片封面（`formImages` 的绑定方式）与 HLS/MSE 是否能播。
## 后续可做

1. **真机联调**：验证 ArkWeb 的 `localStorage`、`<audio>` 与 `hls.js`（MSE）在设备上的行为，确认桥的 20 秒超时是否足够。
2. **媒体会话**：接 ArkTS `avSession`，补齐锁屏与耳机按键。
3. **签名进 CI**：把 DevEco 产出的证书以 Secret 注入，产出可直接安装的 HAP。
4. **设备类型**：接 HarmonyOS 商业 SDK 后把 `module.json5` 的 `deviceTypes` 从 `default` 改为 `phone`/`tablet`/`2in1`。
