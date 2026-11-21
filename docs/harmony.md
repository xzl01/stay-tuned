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
  harmony-dist/stay-tuned-1.6.2-unsigned.hap
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
| 音频播放 | 走 ArkWeb 的 HTML5 音频；HLS 由 `hls.js`（MSE）处理 |
| 实时频谱 | 依赖 Web Audio 分析器，ArkWeb 支持情况需真机验证 |
| Media Session / 锁屏控制 | ArkWeb 未提供对应能力，暂不生效；后续可用 ArkTS 媒体会话补齐 |
| 后台播放 | 未申请长时任务（`ohos.permission.KEEP_BACKGROUND_RUNNING`） |
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

## 后续可做

1. **真机联调**：验证 ArkWeb 的 `localStorage`、`<audio>` 与 `hls.js`（MSE）在设备上的行为，确认桥的 20 秒超时是否足够。
2. **媒体会话**：接 ArkTS `avSession`，补齐锁屏与耳机按键。
3. **签名进 CI**：把 DevEco 产出的证书以 Secret 注入，产出可直接安装的 HAP。
4. **设备类型**：接 HarmonyOS 商业 SDK 后把 `module.json5` 的 `deviceTypes` 从 `default` 改为 `phone`/`tablet`/`2in1`。
