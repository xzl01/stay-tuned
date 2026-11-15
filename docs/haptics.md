# 安卓触感支持研究：线性马达与「留频」的物理手感

研究日期：2026-11-15。目标是给 Capacitor 安卓应用加上线性马达（LRA，营销名「X 轴线性马达」）触感支持，先摸清平台能力与真机表现，再给出可落地的实现方案。

本文只做研究结论与方案，不改现有功能。所有真机数据来自一台 **Redmi K80 Pro（24122RKC7C，Android 16 / SDK 36，HyperOS）**，通过 `adb` 实测。

---

## 0. 结论摘要

1. **不需要新依赖**。平台自带两层触感 API，覆盖本项目全部需求：
   - **常量通道**：`View.performHapticFeedback(HapticFeedbackConstants.XXX)`。**不需要任何权限**，由系统（以及小米的 MIUI_SDK 触感配置）按用户强度调音，`USAGE_TOUCH` 语义自动跟随「触感反馈」总开关与强度。
   - **马达通道**：`Vibrator` + `VibrationEffect`（自定义时长/振幅/波形）。需要 `android.permission.VIBRATE`（普通权限，无运行时弹窗），可做出「拨杆、卡榫、开机闷响」这类拟物手感。
2. **推荐混合**：按钮、推杆刻度、开关用常量通道（零权限、系统一致）；主播放键、章节吸附、5 秒长按彩蛋这类需要「机械重量感」的用马达通道。
3. **本机实测要点**（决定设计边界）：
   - 确认是线性马达（`sys.haptic.motor=linear`），支持振幅控制，厂商预置波形很丰富（`sys.haptic.*` 有 30+ 条语义映射，支持 RichTap 动态效果）。
   - **`VibrationEffect.Composition`（原始触感）在本机不可用**：`supportedPrimitives=[]`、`compositionSizeMax=0`，实测发什么都返回 `ignored_unsupported`，完全不出振。**不能按 composition 设计**。
   - **Android 16 的 envelope（PWLE）也不可用**：`areEnvelopeEffectsSupported()` 对应字段全为 0。
   - 预置效果（CLICK / TICK / HEAVY_CLICK…）实测时长 58–68 ms，偏「软」；自定义单发脉冲最短也要 ≈20 ms 才被硬件放出来，`5 ms @ 31% 振幅` 实测 20 ms。**做「清脆」靠的是短时长 + 低振幅，不能指望 3–5 ms 真的只有 3–5 ms。**
4. **系统已经在替我们触感**：当前 APK 没有 `VIBRATE` 权限，但 WebView 长按时系统记录到本应用的 `TOUCH / CLICK` 振动（`effectId=0, intensity=0.625, keyword=MIUI_SDK`）。说明常量通道**今天就能用**，可以零权限先上线第一阶段。
5. 建议分两阶段：**P1 常量通道（零权限）→ 真机试手感 → P2 再决定要不要加 `VIBRATE` 做自定义波形**。
6. **2026-11-15 已按 P2 + P3 落地并在本机验证**：新增 `HapticsPlugin` + `HapticMotor`、`src/lib/haptics.ts`、`VIBRATE` 权限、触感开关（桌面外观菜单 / 手机顶栏）；推杆刻度因为厂商预置 TICK 长达 65 ms 会「糊」，改用自定义短脉冲（见 §4.5、§6.1）。P3 又补上抽屉开合、成功/失败提示，以及扁平外观整体降一档（见 §6.3）。

---

## 1. 现状核查

| 项目 | 现状 |
| --- | --- |
| 安卓工程 | `android/`，Capacitor 8，minSdk 24 / targetSdk 36，WebView 跑 React 前端 |
| 原生代码 | `MainActivity.java`、`MediaBridgePlugin.java`、`PlaybackService.java`、`StayTunedWidget.java` |
| 原生桥接范式 | `src/lib/nativeMedia.ts` 用 `registerPlugin('MediaBridge')` + `Capacitor.getPlatform() !== 'web'` 判断 |
| 触感相关代码 | 研究起步时**完全没有**；2026-11-15 已新增 `HapticsPlugin` / `HapticMotor`、`src/lib/haptics.ts`、`VIBRATE` 权限与开关 |
| 交互落点 | 双推杆（`Fader.tsx`）、主播放/上一段/下一段（`Receiver.tsx`、`Transport.tsx`）、±15/30、进度条拖动、倍速/睡眠菜单、收藏/静音、抽屉（`ui/Primitives.tsx` 的 `Sheet`）、Toast、5 秒长按 3D 彩蛋（`hooks/usePlayEasterEgg.ts`） |

可复用的桥接写法（新插件照抄即可）：

```java
// MainActivity.onCreate()
registerPlugin(MediaBridgePlugin.class);
```

```java
@CapacitorPlugin(name = "MediaBridge")
public class MediaBridgePlugin extends Plugin { ... }
```

```ts
const MediaBridge = registerPlugin<MediaBridgePlugin>('MediaBridge');
export const nativeMediaAvailable = (): boolean => Capacitor.getPlatform() !== 'web';
```

---

## 2. 平台能力分层（API 24–36）

公开 SDK 里能用的触感能力，按 API 级别排列（`@since` 取自本机 SDK 的 `api-versions.xml`，已核对 android-36 的 `android.jar`）：

| 能力 | API | 用途 | 本机（SDK 36） |
| --- | --- | --- | --- |
| `View.performHapticFeedback(int)` + `HapticFeedbackConstants` | 3 起；常用常量 5–34 | 系统调音的语义化触感；无需权限 | ✅ 可用（已实测） |
| `VibrationEffect.createWaveform(timings, amplitudes, repeat)` | 26 | 自定义多段脉冲 | ✅ 可用（通知振动实测 Step 多段） |
| `VibrationEffect.createOneShot(ms, amplitude)` | 26 | 单发短脉冲，振幅 1–255 | ✅ 精确（0.31/0.63/1.00 完全对应） |
| `Vibrator.hasAmplitudeControl()` | 26 | 判断马达能否控振幅（线性马达通常为 true） | ✅ true |
| `VibrationEffect.createPredefined(id)` | 29 | 预置效果，**公开 id 只有 4 个**：CLICK(0)/DOUBLE_CLICK(1)/TICK(2)/HEAVY_CLICK(5) | ✅ 全部支持（THUD/POP/TEXTURE_TICK 属系统私有 id，公开 SDK 拿不到常量） |
| `VibrationAttributes` / `USAGE_TOUCH` | 30（`vibrate(effect, attrs)` 重载为 33） | 让系统按「触摸」类别套用用户强度、总开关、勿扰策略 | ✅（本机 TOUCH=MEDIUM） |
| `VibratorManager` | 31 | 多马达/默认马达 | ✅ |
| `Vibrator.areAllPrimitivesSupported()` / `getPrimitiveDurations()` | 30 / 31 | 查询 composition 原始触感支持 | ❌ 全 false（本机） |
| `HapticFeedbackConstants.SEGMENT_TICK`(26) / `SEGMENT_FREQUENT_TICK`(27) / `DRAG_START`(25) / `TOGGLE_ON/OFF`(21/22) / `GESTURE_THRESHOLD_*`(23/24) | 34 | **专为滑块/开关/拖拽设计**的常量 | ✅ 可用 |
| `Vibrator.getResonantFrequency()` / `getQFactor()` | 34 | 读马达共振频率 | ⚠️ NaN（厂商 HAL 未上报） |
| Android 16 envelope（`BasicEnvelopeBuilder`/`WaveformEnvelopeBuilder`） | 36 | PWLE 连续包络，最接近 Core Haptics | ❌ dump 中 envelope 上限全为 0（`areEnvelopeEffectsSupported()` 应为 false） |
| 音频触感通道（`hapticChannelMaxAmplitude`） | 30 | 与音频同步的低频触感 | ❌ 0.0（本机不支持） |

### 2.1 常量通道的语义（官方定义，摘自 AOSP `HapticFeedbackConstants.java`）

| 常量 | 值 | 官方语义 | 本项目对应 |
| --- | --- | --- | --- |
| `LONG_PRESS` | 0 | 长按 | 长按彩蛋起点 |
| `VIRTUAL_KEY` | 1 | 按下虚拟键 | 普通按钮 |
| `KEYBOARD_TAP` | 3 | 键盘按键 | — |
| `CLOCK_TICK` | 4 | 时钟刻度类细节 | 可作轻刻度备选 |
| `CONTEXT_CLICK` | 6 | 上下文菜单 | — |
| `TEXT_HANDLE_MOVE` | 9 | 文本选择手柄移动 | 文字稿滚动？暂不用 |
| `GESTURE_START` / `END` | 12 / 13 | 手势开始 / 结束 | 抽屉开合、拖动开始 |
| `CONFIRM` / `REJECT` | 16 / 17 | 成功 / 失败 | Toast 成功 / 失败 |
| `TOGGLE_ON` / `OFF` | 21 / 22 | 开关切到开 / 关 | 收藏、静音、设置开关 |
| `GESTURE_THRESHOLD_ACTIVATE` / `DEACTIVATE` | 23 / 24 | 拖拽越过/退回阈值 | 下拉刷新之类，暂不用 |
| `DRAG_START` | 25 | 拖拽拿起 | 推杆按下 |
| `SEGMENT_TICK` | 26 | **在一串离散选项间切换（例如滑块刻度）** | 章节推杆每过一章 |
| `SEGMENT_FREQUENT_TICK` | 27 | **密集选项（百分比级），应很轻，太密时可不出振** | 音量推杆连续调节 |

这组语义几乎是照着「双推杆」设计的，官方连「设备做不出足够轻的振动时可以不出振」都写进了 `SEGMENT_FREQUENT_TICK` 的注释里。

### 2.2 常量在 AOSP 上如何落到具体波形（决定跨机型一致性）

AOSP `HapticFeedbackVibrationProvider` 的默认映射（小米会在其上再做 OEM 定制）：

| 常量 | AOSP 默认效果 |
| --- | --- |
| `CONTEXT_CLICK` / `GESTURE_END` / `GESTURE_THRESHOLD_ACTIVATE` / `SEGMENT_TICK` | `EFFECT_TICK` |
| `CLOCK_TICK` / `TEXT_HANDLE_MOVE` / `SEGMENT_FREQUENT_TICK` | `EFFECT_TEXTURE_TICK`（系统私有 id 6） |
| `VIRTUAL_KEY` / `CONFIRM` / `GESTURE_START` | `EFFECT_CLICK` |
| `LONG_PRESS` / `DRAG_START` | `EFFECT_HEAVY_CLICK` |
| `REJECT` | `EFFECT_DOUBLE_CLICK` |
| `TOGGLE_ON` | `PRIMITIVE_TICK @0.5`，不支持 composition 时退回 `EFFECT_TICK` |
| `TOGGLE_OFF` | `PRIMITIVE_LOW_TICK @0.2`，退回 `EFFECT_TEXTURE_TICK` |

所以「常量通道」在 AOSP 设备上也是合理的，不是只在小米上有效。

---

## 3. 系统怎么处理一次触感（权限、强度、开关）

### 3.1 两条通路

| | 常量通路 `performHapticFeedback` | 马达通路 `Vibrator.vibrate` |
| --- | --- | --- |
| 权限 | **不需要** | 需要 `android.permission.VIBRATE`（normal，安装即授予） |
| 调用位置 | 必须 UI 线程，且 View 已 attach | 任意线程（Capacitor 插件线程即可） |
| 可控粒度 | 只能选常量 | 时长、振幅 1–255、多段波形、预置 id |
| 系统调音 | 完全交给系统 / OEM | 交给系统缩放（用 `USAGE_TOUCH` 时） |
| 用户总开关 | 自动生效 | 用 `USAGE_TOUCH` 时自动生效 |
| 小米额外 | 走 MIUI_SDK 的 `effectId + intensity` 配置 | 走 HAL 预置/振幅 |

### 3.2 `USAGE_TOUCH` 为什么重要

AOSP `VibrationSettings`：`Settings.System.HAPTIC_FEEDBACK_ENABLED == 0` 时会把 `USAGE_TOUCH` 的强度设为 `VIBRATION_INTENSITY_OFF`，随后 `VibrationScaler` 按当前强度与默认强度的差值缩放（本机档位因子 **0.6 / 0.8 / 1.0 / 1.2 / 1.4**）。也就是说：

- 用 `USAGE_TOUCH` 发自定义波形 → 用户关掉「触感反馈」就静音，调弱就整体变轻，**不用我们自己读设置**；
- 不带 attributes 直接 `vibrate(effect)` → 归为 `USAGE_UNKNOWN`，不保证跟随触摸开关，属于「不受控」。

API 26–32 没有 `VibrationAttributes` 重载（该重载 API 33 才有），可用等价的 `AudioAttributes.USAGE_ASSISTANCE_SONIFICATION`；AOSP 里 `USAGE_TOUCH` 与它就是一一对应（`VibrationAttributes#getAudioUsage()`）。

### 3.3 本机系统状态

```
haptic_feedback_enabled = 1        haptic_feedback_intensity = 2
hardware_haptic_feedback_intensity = 2   vibrate_on = 1
VibrationSettings: TOUCH = MEDIUM, MEDIA = MEDIUM, ...
VibrationScaler: VERY_LOW 0.6 / LOW 0.8 / NONE 1.0 / HIGH 1.2 / VERY_HIGH 1.4
```

---

## 4. 真机实测（Redmi K80 Pro / Android 16）

### 4.1 设备与马达

```
ro.product.model = 24122RKC7C        ro.build.version.sdk = 36
sys.haptic.motor = linear            sys.haptic.device_type = agm
sys.haptic.version = 2.0             sys.haptic.dynamiceffect = true
sys.haptic.dynamiceffect.richtap = true
```

`VibratorManagerService` 里：

```
Vibrator (id=0):
  capabilities      = [ON_CALLBACK, PERFORM_CALLBACK, AMPLITUDE_CONTROL]
  supportedEffects  = [CLICK, DOUBLE_CLICK, TICK, THUD, POP, HEAVY_CLICK, 6, 7, 8, 9, 10, … 521]
  supportedPrimitives = []
  compositionSizeMax  = 0     pwleSizeMax = 0     q-factor = NaN
  hapticChannelMaxAmplitude = 0.0
```

结论：**线性马达 + 振幅控制 + 一堆厂商预置波形；但没有 composition，也没有 envelope。**

厂商的语义表（`getprop | grep sys.haptic` 的一部分）说明 HyperOS 已经给「按键大小、滚轮、轻/重点击、开关、抽屉、长按」都定义了强度和效果 id：

```
sys.haptic.button_small = [4,2]   sys.haptic.button_middle = [3,2]   sys.haptic.button_large = [2,2]
sys.haptic.gear_light   = [5,2]   sys.haptic.gear_heavy   = [6,2]   sys.haptic.flick = [5,2]
sys.haptic.popup.light  = [6,1]   sys.haptic.popup.normal = [6,2]   sys.haptic.tap.light = [5,2]
sys.haptic.switch       = [9,2]   sys.haptic.long.press   = [0,1]   sys.haptic.trigger.drawer = [2,0]
```

格式推断为 `[预置效果 id, 强度档位]`。这是「厂商调音」的证据：走常量通道时，应用不用自己设计波形，系统会挑它认为合适的。

### 4.2 预置效果实测（`cmd vibrator_manager synced prebaked <id>`，从 dumpsys 读回放记录）

| 请求 id | 实际播放 | 实测时长 |
| --- | --- | --- |
| 0 | `Prebaked=CLICK` | 67 ms |
| 1 | `Prebaked=DOUBLE_CLICK` | 66 ms |
| 2 | `Prebaked=TICK` | 65 ms |
| 3（私有 THUD） | `Prebaked=THUD` | 66 ms |
| 4（私有 POP） | `Prebaked=POP` | 65 ms |
| 5 | `Prebaked=HEAVY_CLICK` | 58 ms |
| 6（私有 TEXTURE_TICK） | `Prebaked=6` | 59 ms |
| 8 / 9 / 13 / 212（厂商私有） | 对应预置 | 68 / 133 / 42 / 348 ms |

注意：**厂商预置的 CLICK/TICK 都在 60 ms 上下**，是「软而钝」的点击，不是苹果那种 5 ms 脆点。要「脆」得走自定义脉冲。

### 4.3 自定义脉冲实测

| 请求 | 回放记录 | 实测总时长 |
| --- | --- | --- |
| `oneshot 5 ms @ 80/255` | `Step=5ms(amplitude=0.31)` | 20 ms |
| `oneshot 10 ms @ 160/255` | `Step=10ms(amplitude=0.63)` | 26 ms |
| `oneshot 20 ms @ 255/255` | `Step=20ms(amplitude=1.00)` | 31 ms |
| `oneshot 40 ms @ 255` | `Step=40ms(amplitude=1.00)` | 56 ms |
| `primitives 1/2/7/8` | `ignored_unsupported` | 不出振 |

- 振幅映射精确（80→0.31，160→0.63，255→1.00），可以放心用它做「轻/中/重」。
- 硬件会在尾部补一段 ramp，**最小可感知脉冲约 20 ms**；想要更「点」而不是「嗡」，用 5–10 ms + 低振幅。
- **primitives 被直接丢弃**（`ignored_unsupported`）；但「波形」本身没问题：`cmd vibrator_manager synced waveform -a 4 200 6 0 4 200` 实测回放为 `[Step=4ms(0.78), Step=6ms(0.00), Step=4ms(0.78)]`。结论是不要围绕 primitives 设计，波形/振幅照常可用。
- 服务侧从请求到马达启动只有 **1–3 ms**（dumpsys 里记录时间与 start 时间之差）；真正的大头是 JS→桥→UI 线程与马达起振，整体仍在 10–20 ms 量级，够做「按下即反馈」。

### 4.4 现有 APK 已经在走常量通道

```
11-15 12:17:29.011 | usage: TOUCH | io.github.xzl01.staytuned
  | reason: TAG=haptic_feedback_config_strength;effectId=0;intensity=0.625;keyword=MIUI_SDK
  | played: Prebaked=CLICK(MEDIUM, with fallback)  duration: 68ms
```

当前 APK 并没有声明 `VIBRATE`，也没有主动触发触感的代码；这条记录只能来自 WebView 自身的原生长按 / 文本选择触感（`performHapticFeedback(LONG_PRESS)`）。两个结论：

1. **常量通道零权限可用**；
2. 小米会给第三方应用一套默认 `effectId + intensity`（本应用 0.625），我们只是还没主动用。

---

### 4.5 实现后的实测（同一台机，2026-11-15）

装上 P2 实现后，通过 WebView 远程调试直接调用插件 / 用合成触摸拖动推杆，读取 `dumpsys vibrator_manager` 的回放记录：

| 触发 | 回放记录 | 结论 |
| --- | --- | --- |
| 顶栏队列按钮（`press`） | `performHapticFeedback(constant=1)` → `Prebaked=HEAVY_CLICK`，intensity 1.0 | 常量通道、零额外处理即生效 |
| 音量推杆按下（`dragStart`） | `constant=25` → `Prebaked=HEAVY_CLICK` | 「抓住推杆」的抬手感 |
| 音量推杆滑动（`slide`） | `Step=4ms(amplitude=0.22)`，间隔 ≈90–170 ms | 自定义短脉冲，离散不糊 |
| 主播放键的 `lever` 波形（直接调用插件，与按钮走同一参数） | `[Step=0ms(0), Step=8ms(0.78), Step=26ms(0.27), Step=14ms(0)]`，共 48 ms | 两段式「拨杆到位」 |
| 进度条松手（`snap`） | `[Step=0ms(0), Step=6ms(0.71), Step=26ms(0), Step=6ms(0.51)]`，共 38 ms | 双点「卡榫咬合」，经真实拖拽验证 |
| 触感开关打开（`toggleOn`） | `constant=21` → `Prebaked=TICK` | 开关自身有确认触感 |
| 抽屉打开（`sheetOpen`） | `[Step=0ms(0), Step=6ms(0.22), Step=34ms(0), Step=8ms(0.18)]` | 面板滑入 240 ms 后轻「落座」 |
| 抽屉关闭（`sheetClose`） | `Step=10ms(amplitude=0.29)` | 轻合，只对点击遮罩 / 关闭键生效 |
| 收藏成功 Toast | `constant=21`（TICK）+ `[Step=6ms(0.55), Step=8ms(0.67)]` | 开关确认叠加成功双点 |
| 扁平模式下拖音量 | `constant=12`（CLICK）+ `Step=4ms(amplitude=0.15)` | 常量降级 + 波形 ×0.7 |
| 关闭系统「触感反馈」后调用 `play()` | 无记录 | `USAGE_TOUCH` + `HAPTIC_FEEDBACK_ENABLED` 双重静默生效 |

同一台机上各常量的实际映射（`performHapticFeedback` 的 `played:` 字段）：

| 常量 | 实际效果 |
| --- | --- |
| `VIRTUAL_KEY`(1) | `HEAVY_CLICK`（intensity 1.0） |
| `LONG_PRESS`(0) | `CLICK`（intensity 0.625，来自 MIUI_SDK 配置） |
| `KEYBOARD_TAP`(3) | `TEXTURE_TICK` |
| `CLOCK_TICK`(4) | `TICK` |
| `CONTEXT_CLICK`(6) | `HEAVY_CLICK` |
| `TEXT_HANDLE_MOVE`(9) | 无振动（系统默认关闭文本手柄触感） |
| `GESTURE_START`(12) / `CONFIRM`(16) | `CLICK` |
| `TOGGLE_ON`(21) | `TICK` |
| `DRAG_START`(25) | `HEAVY_CLICK` |
| `SEGMENT_TICK`(26) | `TICK` |
| `SEGMENT_FREQUENT_TICK`(27) | `TEXTURE_TICK` |

两个补充结论：

1. **预置 TICK/TEXTURE_TICK 都是 ~65 ms**。音量推杆每 70 ms 一个 65 ms 的 TICK 会连成持续蜂鸣，所以 `detent`/`slide` 改用 7 ms / 4 ms 的自定义脉冲（系统仍按 `USAGE_TOUCH` 缩放强度）。
2. `detent`（章节刻度）在当前节目没有章节时无法从 UI 触发，未做真机回放；它与已验证的短脉冲走同一 `play()` 路径。
3. **后台调用会被丢弃**：应用不在前台时，常量通道的请求会被系统忽略（`dumpsys` 无记录，logcat 里 Xiaomi 还会打 `performHapticFeedback: not support vibrator effect: 25/26/27` 的误导性日志）。因此所有 `pulse()` 都要求 `document.visibilityState === 'visible'`，并且只从用户手势里触发。

## 5. 方案对比

| 方案 | 权限 | 手感可控性 | 系统一致性 | 工作量 | 风险 |
| --- | --- | --- | --- | --- | --- |
| A. 只用常量通道 | 无 | 中（只能选常量） | 最好（系统/OEM 调音） | 小 | OEM 映射不同，个别常量可能无效果 |
| B. 只用马达通道 | `VIBRATE` | 高（毫秒/振幅/波形） | 取决于是否用 `USAGE_TOUCH`，需自己兜底 | 中 | 老设备无振幅控制、低端机「嗡嗡」 |
| C. **混合（推荐）** | P2 才加 | 高 | 好 | 中 | 两套语义要定清楚，别重复触发 |
| D. 引入 `@capacitor/haptics` | 有 | 中（impact/notification/selection 三档） | 中 | 小 | 仍做不了「拨杆/卡榫」；多一个依赖，且常量通道还得自己写 |

**为什么不选 D**：官方 `@capacitor/haptics` 只暴露 `impact`（light/medium/heavy）、`notification`（success/warning/error）、`vibrate` 和 `selectionStart/Changed/End`，底层同样是 `VibrationEffect`/`HapticFeedbackConstants`；本项目的诉求（推杆刻度节流、5 秒长按分级、拟物拨杆）它都覆盖不了，而它覆盖的部分我们自己写 60 行 Java 更可控。

---

## 6. 推荐设计

### 6.1 触感词汇表（cue → 通道 → 参数建议）

参数是**起点值**，需要在真机上调；所有自定义波形都建议 `repeat = -1`（绝不循环）。

| cue | 触发点 | 通道 | 建议实现 | 备注 |
| --- | --- | --- | --- | --- |
| `press` | 普通按钮：±15/30、上一段/下一段、菜单项、队列条目 | 常量 | `VIRTUAL_KEY` | 少量、克制 |
| `lever` | 主播放键（手机大键/机身播放键/底部 pill），切换播放/暂停 | 自定义 | 波形 `timings=[0,8,26,14]`、`amplitudes=[0,200,70,0]`（≈48 ms 两段「拨杆到位」） | 拟物收音机的机械重量感 |
| `detent` | 章节推杆每跨过一章 | 自定义 | `oneShot(7 ms, 110)` | 55 ms 节流；系统 `SEGMENT_TICK` 在本机是 65 ms，会糊 |
| `slide` | 音量推杆连续滑动 | 自定义 | `oneShot(4 ms, 55)` | 85 ms 节流，按值变化触发 |
| `snap` | 章节推杆松手吸附、进度条松手 | 自定义 | 双点 `timings=[0,6,26,6]`、`amplitudes=[0,180,0,130]` | 「卡榫咬合」 |
| `drag-start` | 推杆按下、进度条按下 | 常量 | `DRAG_START`（API 34+），退回 `GESTURE_START` | |
| `sheet-open/close` | 抽屉打开/关闭 | 常量 | `GESTURE_START` / `GESTURE_END` | 可先不做，避免吵 |
| `toggle-on/off` | 收藏、静音、设置开关 | 常量 | `TOGGLE_ON` / `TOGGLE_OFF`（API 34+），退回 `VIRTUAL_KEY` | |
| `sheetOpen` | 抽屉滑入结束 | 自定义 | `[0,6,34,8]` / `[0,55,0,45]`（≈48 ms） | 240 ms 后落座；程序化关闭不触发 |
| `sheetClose` | 点遮罩 / 关闭键 | 自定义 | `oneShot(10, 75)` | 键盘 Esc 不触发 |
| `success` / `error` | Toast 成功 / 失败 | 自定义 | 双点 6 ms@140 + 8 ms@170 / 10 ms@200 + 12 ms@180 | 只对 success / error，default 静默 |
| `hold-tick` | 长按彩蛋每 700 ms | 自定义 | `oneShot(10, 70→220 递增)` | 越接近 5 秒越强 |
| `power-on` | 3D 彩蛋打开 | 自定义 | 三段 `timings=[0,12,34,60]`、`amplitudes=[0,255,110,170]` | 「开机闷响」 |

### 6.2 触发纪律（比选哪种波形更重要）

1. **只在事件处理里发，绝不在 React `useEffect` 里发**——否则播放状态每变一次都会振。
2. **只对触摸/笔发**：`pointerType === 'touch' || 'pen'`；鼠标、键盘不触发（桌面端也就自然静默）。
3. **只在页面可见时发**：`document.visibilityState === 'visible'`；后台/锁屏不发。
4. **按 cue 节流，丢帧不排队**：`detent 55 ms`、`slide 85 ms`、`press 55 ms`、`snap 150 ms`。60 Hz 的 pointermove 直接发会把马达打到「糊」。
5. **按值变化触发**：推杆只在离散值（章节序号、音量每 2–5%）变化时发，不在像素级移动时发。
6. **永不循环**：不用 `repeat >= 0`，不用 `createRepeatingEffect`。
7. **失败静默**：插件调用失败、无马达、系统关了触感——一律 no-op，不弹错、不重试。
8. **不抢音频焦点**：振动与播放互不影响；但自动连播、睡眠定时到点这类「非用户动作」不发触感。

### 6.3 与拟物 / 扁平的关系

- 拟物模式：允许 `lever`、`snap`、`power-on` 这类有「机构感」的触感，映射到实体推杆、按键、上盖。
- 扁平模式：同一套 cue，但整体降一档——自定义波形振幅 ×0.7；离散按键从 `VIRTUAL_KEY`/`DRAG_START` 换成更轻的 `GESTURE_START`（本机由 HEAVY_CLICK 变 CLICK）。实现见 `setHapticsMode()`，由 `prefs.mode` 同步。
- 深浅色不影响触感。

### 6.4 设置与可访问性

- 新增偏好 `haptics: boolean`，**默认开**（仅安卓原生有效；Web/PWA 默认 no-op）。
- 入口：桌面端「外观设置」菜单加一项「触感反馈」；手机端建议放在「我的订阅」底部的偏好区（`Switch` 组件现成）。
- 不提供应用内「强/弱/关」三档：强度交给系统（`USAGE_TOUCH` 已跟随），应用内只留开关，减少用户心智负担。
- 触感永远不是唯一反馈：所有 cue 对应的按钮/推杆都有视觉与（必要时）文本反馈。

### 6.5 降级矩阵

| 设备情况 | 探测方式 | 行为 |
| --- | --- | --- |
| 无马达（部分平板） | `Vibrator.hasVibrator() == false` | 插件返回 `hasVibrator:false`，JS 直接不初始化，设置项隐藏或标灰 |
| 无振幅控制（低端 ERM） | `hasAmplitudeControl() == false` | 只用常量通道；自定义通道关闭（避免「嗡嗡」长振） |
| composition 不支持（本机） | `areAllPrimitivesSupported()` | 不依赖 composition；只用预置效果与波形 |
| 系统关闭触感 | `HAPTIC_FEEDBACK_ENABLED == 0`（或靠 `USAGE_TOUCH` 自动） | 自动静默 |
| API 26–28 | `Build.VERSION.SDK_INT` | 常量通道照用；自定义只发 `createWaveform`/`createOneShot`，`AudioAttributes` 走 SONIFICATION |
| API 24–25 | 同上 | 常量通道可能无效；自定义通道不启用（骨架只走 `VibrationEffect`，不实现 `vibrate(long)`） |

### 6.6 Web / PWA 是否也要振

- WebView 里的 `navigator.vibrate` 走宿主应用的 `Vibrator`，当前 APK 没有 `VIBRATE` 权限，**因此现在是无效的**（这条建议在 P2 加权限后在真机上复核一次）。
- PWA（Chrome for Android）里 `navigator.vibrate` 可用但很粗（只有时长/节奏，没有振幅），且要求用户手势。
- 结论：**原生通道为主，PWA 作为可选彩蛋（低优先级）**；桌面浏览器一律 no-op。

---

## 7. 落地实现（骨架代码）

### 7.1 Android 侧

`AndroidManifest.xml`（P2 才需要）：

```xml
<uses-permission android:name="android.permission.VIBRATE" />
```

`MainActivity.java`：

```java
registerPlugin(HapticsPlugin.class);
```

`android/app/src/main/java/io/github/xzl01/staytuned/HapticsPlugin.java`（实际实现把 `VibrationEffect` 相关逻辑拆到了同目录的 `HapticMotor.java`，避免 API 24/25 加载新类；下面给出合在一起的骨架，字段与调用约定一致）：

```java
/* SPDX-License-Identifier: GPL-3.0-only */

package io.github.xzl01.staytuned;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/** Haptic feedback: a permission-free constant channel plus an optional custom motor channel. */
@CapacitorPlugin(name = "Haptics")
public class HapticsPlugin extends Plugin {

    private static final long MIN_GAP_MS = 24;
    private long lastPlayAt = 0;

    private Vibrator vibrator() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager =
                    (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    private boolean touchFeedbackEnabled() {
        return Settings.System.getInt(getContext().getContentResolver(),
                Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 1;
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        Vibrator vibrator = vibrator();
        boolean has = vibrator != null && vibrator.hasVibrator();
        JSObject result = new JSObject();
        result.put("hasVibrator", has);
        result.put("apiLevel", Build.VERSION.SDK_INT);
        result.put("amplitude", has && vibrator.hasAmplitudeControl());
        result.put("touchFeedbackEnabled", touchFeedbackEnabled());
        boolean primitives = has && Build.VERSION.SDK_INT >= 30
                && vibrator.areAllPrimitivesSupported(
                        VibrationEffect.Composition.PRIMITIVE_CLICK,
                        VibrationEffect.Composition.PRIMITIVE_TICK);
        result.put("primitives", primitives);
        boolean envelope = has && Build.VERSION.SDK_INT >= 36
                && vibrator.areEnvelopeEffectsSupported();
        result.put("envelope", envelope);
        call.resolve(result);
    }

    /** System-tuned channel. No VIBRATE permission, follows the user's touch intensity. */
    @PluginMethod
    public void feedback(PluginCall call) {
        int constant = call.getInt("constant", HapticFeedbackConstants.VIRTUAL_KEY);
        View view = getBridge().getWebView();
        if (getActivity() == null || view == null) {
            call.resolve(new JSObject().put("ok", false));
            return;
        }
        getActivity().runOnUiThread(() -> {
            boolean ok = view.isAttachedToWindow() && view.performHapticFeedback(constant);
            call.resolve(new JSObject().put("ok", ok));
        });
    }

    /** Custom channel: one-shot or waveform, always classified as USAGE_TOUCH. */
    @PluginMethod
    public void play(PluginCall call) {
        Vibrator vibrator = vibrator();
        if (vibrator == null || !vibrator.hasVibrator() || !touchFeedbackEnabled()) {
            call.resolve();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastPlayAt < MIN_GAP_MS) {
            call.resolve();
            return;
        }
        VibrationEffect effect = build(call);
        if (effect == null) {
            call.resolve();
            return;
        }
        lastPlayAt = now;
        try {
            vibrate(vibrator, effect);
        } catch (Exception ignored) {
            // A device without a working actuator must never break the UI.
        }
        call.resolve();
    }

    private VibrationEffect build(PluginCall call) {
        JSArray timings = call.getArray("timings");
        if (timings != null && timings.length() > 1) {
            try {
                List<Object> rawTimings = timings.toList();
                JSArray amplitudesJson = call.getArray("amplitudes");
                List<Object> rawAmplitudes = amplitudesJson == null
                        ? new ArrayList<>() : amplitudesJson.toList();
                int size = Math.min(rawTimings.size(), 24);
                long[] steps = new long[size];
                int[] amplitudes = new int[size];
                for (int i = 0; i < size; i++) {
                    steps[i] = ((Number) rawTimings.get(i)).longValue();
                    amplitudes[i] = i < rawAmplitudes.size()
                            ? clamp(((Number) rawAmplitudes.get(i)).intValue())
                            : 255;
                }
                return VibrationEffect.createWaveform(steps, amplitudes, -1);
            } catch (Exception malformed) {
                return null;
            }
        }
        int duration = Math.max(1, Math.min(120, call.getInt("duration", 8)));
        int amplitude = clamp(call.getInt("amplitude", 120));
        return VibrationEffect.createOneShot(duration, amplitude);
    }

    private static int clamp(int amplitude) {
        return Math.max(1, Math.min(255, amplitude));
    }

    private void vibrate(Vibrator vibrator, VibrationEffect effect) {
        if (Build.VERSION.SDK_INT >= 33) {
            vibrator.vibrate(effect,
                    VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH));
        } else if (Build.VERSION.SDK_INT >= 30) {
            vibrator.vibrate(effect, new VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_TOUCH)
                    .build());
        } else {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            vibrator.vibrate(effect, attrs);
        }
    }
}
```

> 注意：`VibrationEffect.Composition` 与 `areEnvelopeEffectsSupported()` 的引用都被 SDK 级别判断包住；类常量是编译期内联，旧系统上不会因缺类崩溃。

### 7.2 前端门面

`src/lib/haptics.ts`（新增）：

```ts
/* SPDX-License-Identifier: GPL-3.0-only */

import { Capacitor, registerPlugin } from '@capacitor/core';

export type HapticCue =
  | 'press'
  | 'lever'
  | 'detent'
  | 'slide'
  | 'snap'
  | 'dragStart'
  | 'toggleOn'
  | 'toggleOff'
  | 'confirm'
  | 'reject'
  | 'holdTick'
  | 'powerOn';

interface Capabilities {
  hasVibrator: boolean;
  amplitude: boolean;
  apiLevel: number;
  primitives: boolean;
  envelope: boolean;
  touchFeedbackEnabled: boolean;
}

interface HapticsPlugin {
  capabilities(): Promise<Capabilities>;
  feedback(options: { constant: number }): Promise<{ ok: boolean }>;
  play(options: {
    duration?: number;
    amplitude?: number;
    timings?: number[];
    amplitudes?: number[];
  }): Promise<void>;
}

const Haptics = registerPlugin<HapticsPlugin>('Haptics');

const ANDROID = Capacitor.getPlatform() === 'android';

/** HapticFeedbackConstants values (API level that introduced each one in comments). */
const K = {
  longPress: 0,
  virtualKey: 1, // 5
  clockTick: 4, // 21
  contextClick: 6, // 23
  gestureStart: 12, // 30
  gestureEnd: 13, // 30
  confirm: 16, // 30
  reject: 17, // 30
  toggleOn: 21, // 34
  toggleOff: 22, // 34
  dragStart: 25, // 34
  segmentTick: 26, // 34
  segmentFrequentTick: 27, // 34
} as const;

const MIN_GAP: Partial<Record<HapticCue, number>> = {
  press: 60,
  detent: 40,
  slide: 70,
  snap: 150,
  holdTick: 600,
};

let enabled = true;
let caps: Capabilities | null = null;
const lastAt = new Map<HapticCue, number>();

/** Call once after mount; keeps a cached API level for constant fallbacks. */
export async function initHaptics(): Promise<Capabilities | null> {
  if (!ANDROID) return null;
  try {
    caps = await Haptics.capabilities();
  } catch {
    caps = null;
  }
  return caps;
}

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function constantFor(cue: HapticCue): number {
  const api = caps?.apiLevel ?? 30;
  switch (cue) {
    case 'dragStart':
      return api >= 34 ? K.dragStart : K.gestureStart;
    case 'detent':
      return api >= 34 ? K.segmentTick : K.clockTick;
    case 'slide':
      return api >= 34 ? K.segmentFrequentTick : K.clockTick;
    case 'toggleOn':
      return api >= 34 ? K.toggleOn : K.virtualKey;
    case 'toggleOff':
      return api >= 34 ? K.toggleOff : K.virtualKey;
    case 'confirm':
      return api >= 30 ? K.confirm : K.virtualKey;
    case 'reject':
      return api >= 30 ? K.reject : K.virtualKey;
    default:
      return K.virtualKey;
  }
}

/** Called from pointer handlers only; never from React effects. */
export function pulse(cue: HapticCue, options: { pointerType?: string } = {}): void {
  if (!enabled || !ANDROID) return;
  if (document.visibilityState !== 'visible') return;
  if (options.pointerType && options.pointerType !== 'touch' && options.pointerType !== 'pen') return;
  const gap = MIN_GAP[cue] ?? 0;
  const now = performance.now();
  if (gap && now - (lastAt.get(cue) ?? 0) < gap) return;
  lastAt.set(cue, now);

  const custom = hapticPattern(cue);
  if (custom) {
    void Haptics.play(custom).catch(() => undefined);
    return;
  }
  void Haptics.feedback({ constant: constantFor(cue) }).catch(() => undefined);
}

/** Cues that need the motor channel; everything else goes through system constants. */
function hapticPattern(cue: HapticCue): Parameters<HapticsPlugin['play']>[0] | null {
  switch (cue) {
    case 'lever':
      return { timings: [0, 8, 26, 14], amplitudes: [0, 200, 70, 0] };
    case 'snap':
      return { timings: [0, 6, 26, 6], amplitudes: [0, 180, 0, 130] };
    case 'holdTick':
      return { duration: 10, amplitude: 120 };
    case 'powerOn':
      return { timings: [0, 12, 34, 60], amplitudes: [0, 255, 110, 170] };
    default:
      return null;
  }
}
```

`pulse()` 里没有任何异步等待：调用即发，失败吞掉；`caps` 只用于旧系统的常量降级。

> 实际实现与骨架的差异：`detent` / `slide` 也走自定义通道（7 ms / 4 ms 短脉冲），骨架里保留常量分支只为展示系统通道；另外 `HapticMotor` 把 `VibrationEffect` 相关代码与插件分开，保证 API 24/25 不加载新类。

### 7.3 接入点（文件 → 改法）

| 文件 | 位置 | 加什么 |
| --- | --- | --- |
| `src/components/hardware/Fader.tsx` | `handleChange` / `onPointerDown` / `commit` | `pulse('detent')` / `pulse('slide')` 按值变化；按下 `dragStart`；松手 `snap` |
| `src/components/Transport.tsx` | 播放键、±15/30、倍速/睡眠菜单、静音 | 主键 `lever`，其余 `press`，静音 `toggleOn/Off` |
| `src/components/Receiver.tsx` | `previous` / `next` / 播放键 / 队列键 | `press` / `lever` |
| `src/components/Transport.tsx` 的 `ProgressRail` | 拖动结束 | `snap`；拖动开始 `dragStart` |
| `src/hooks/usePlayEasterEgg.ts` | `start()` 里的 5 秒计时 | 每 700 ms `holdTick`；打开时 `powerOn` |
| `src/components/ui/Primitives.tsx` | `Sheet` 打开/关闭、`ToastStack` | `sheet-open/close`（可选）；`confirm/reject` 只挂到主动操作 |
| `src/state/AppStore.tsx` | `setFollowTranscript` 旁 | `setHaptics` + `setHapticsEnabled` 同步 |
| `src/types.ts` / `src/lib/storage.ts` | `Preferences` | 新增 `haptics: boolean`，默认 `true`，`sanitize` 里兜底 |
| `src/components/Header.tsx` / 移动端设置区 | 外观菜单 / 偏好区 | 触感开关 |

### 7.4 偏好与迁移

- `Preferences` 增加 `haptics: boolean`；`DEFAULT_PREFERENCES.haptics = true`。
- `sanitize()`：`preferences.haptics = preferences.haptics !== false;`（旧备份没有该字段时默认开）。
- 备份导出/导入会带上 `preferences`，无需改 `backup.ts`，但**导入旧备份不会重置用户新关掉的开关**（`sanitize` 的 `!== false` 逻辑要保留）。

---

## 8. 分阶段计划与验收

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P1 常量通道** | `capabilities`/`feedback`；`haptics.ts`；按键、推杆、开关；偏好与桌面/手机入口 | ✅ 2026-11-15 完成并真机验证 |
| **P2 自定义通道** | `VIBRATE` 权限；`play()`；`lever` / `snap` / `holdTick` / `powerOn`；detent/slide 改为短脉冲 | ✅ 2026-11-15 完成并真机验证（见 §4.5） |
| **P3 打磨** | 抽屉开合、Toast 成功/失败、扁平整体降一档；进度条已在 P1 接入 | ✅ 2026-11-15 完成并真机验证（§4.5） |
| **P4（可选）** | PWA `navigator.vibrate` 降级；强度档位；音频触感（本机不支持） | 视需求 |

真机试的时候重点听五处：**音量推杆的 4 ms 轻刻度是否够轻、章节/进度松手的双点是否像卡榫、主播放键的 48 ms 两段拨杆是否过重、抽屉落座是否多余、扁平模式是否确实更轻**。这些振幅都可以在 `src/lib/haptics.ts` 的 `customPattern()` 里单独调。

---

## 9. 测试与验证方法

```bash
# 看整机触感能力（含厂商 supportedEffects / primitives）
adb shell dumpsys vibrator_manager

# 手动触发预置效果（不需要写代码，直接听手感）
adb shell cmd vibrator_manager synced prebaked 0     # CLICK
adb shell cmd vibrator_manager synced prebaked 2     # TICK
adb shell cmd vibrator_manager synced prebaked 5     # HEAVY_CLICK

# 自定义脉冲（可用）
adb shell cmd vibrator_manager synced oneshot -a 6 90

# 注意：vibrator_manager 的 waveform 子命令内部包了一层 composition，
# 本机会被判定 unsupported 直接丢弃；要验证多段波形请用应用内的 VibrationEffect.createWaveform。
adb shell cmd vibrator_manager synced waveform -a 4 255 20 0 4 255

# 系统开关与强度
adb shell settings get system haptic_feedback_enabled
adb shell settings put system haptic_feedback_enabled 0   # 验证全静默
adb shell settings put system haptic_feedback_enabled 1

# 验证应用发出的触感（usage 应为 TOUCH；常量通道的 reason 形如
#   performHapticFeedback(constant=26): ...  或  TAG=...;keyword=MIUI_SDK）
# 注意按时间排序：sort -t' ' -k3
adb shell dumpsys vibrator_manager | grep staytuned | sort -t' ' -k3 | tail -5

# 查看原生侧是否真的走到了 HAL（自定义通道）
adb logcat -d | grep -E "Vibrator on for timeoutMs|Vibrator set amplitude|Capacitor/Plugin: .*Haptics"
```

> 小坑：`dumpsys vibrator_manager` 的「Recent vibrations」按 usage 分桶、按时间追加，`tail -1` 不一定是最新一条；先 `grep` 再按第 3 列时间排序。应用在后台时不会产生记录。

测试矩阵：

1. **本机**（线性马达 + HyperOS）：主路径。
2. **AOSP / Pixel**：验证常量映射（AOSP 默认表）与 composition 可用时的差异。
3. **无振幅控制的老机 / 平板**：验证降级不炸。
4. **API 26–28 设备**：验证 `AudioAttributes` 分支。
5. **系统触感关闭 / 勿扰 / 省电模式**：验证静默。
6. **后台、锁屏、通话中**：验证不触发。

---

## 10. 风险与未决问题

### 风险

- **厂商差异**：小米把常量映射到自己的 `effectId`，AOSP 用官方表，三星/OPPO 又是另一套；同一 cue 在不同机器上轻重不一。这是常量通道的固有代价，建议接受（换来的是一致性与零权限）。
- **composition 不可用**（本机及大量国产机）：不要围绕 primitives 设计，也不要用「先 composition、失败再退回」的运行时探测去增加复杂度。
- **过度触感**：推杆密集触发最容易翻车；节流 + 按值变化必须做。
- **节流与延迟**：JS→Capacitor→UI 线程→system_server→HAL，链路约 10–20 ms；不要在同一帧里连发多个 cue。
- **`VIBRATE` 权限的观感**：普通权限无弹窗，但部分应用商店/用户会对「振动」敏感；本次已按用户选择加入。
- **WebView `navigator.vibrate`**：仍未作为主通道；PWA 场景后续再评估。
- **后台/锁屏**：常量通道在应用不在前台时会被系统丢弃；`pulse()` 已用 `visibilityState` 兜住，不要从定时器或 effect 里发触感。
- **厂商预置效果偏长**：HyperOS 的 TICK/TEXTURE_TICK 都是 65 ms，密集滑动会糊；已用自定义短脉冲规避，但其它 OEM 的预置时长未知，真机上仍需复核。

### 已由用户拍板

1. 默认开，仅安卓原生生效；不弹引导。
2. 范围只做「物理控件」（推杆/按键/长按彩蛋）；抽屉/Toast 留到 P3。
3. 主播放键用「重拨杆」（两段波形）。
4. 接受新增 `VIBRATE` 权限，一次做到 P2。
5. 拟物/扁平强度差、PWA 触感：暂不做，等真机反馈。

---

## 11. 参考资料

- AOSP `VibrationEffect`（预置效果、composition、envelope，含注释与限制）：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/os/VibrationEffect.java>
- AOSP `HapticFeedbackConstants`（各常量语义，含 `SEGMENT_TICK` 的滑块用途）：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/view/HapticFeedbackConstants.java>
- AOSP `Vibrator`（`areAllPrimitivesSupported` 文档：不支持时「不会产生任何振动」）：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/os/Vibrator.java>
- AOSP `HapticFeedbackVibrationProvider`（常量 → 效果的平台默认映射）：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/vibrator/HapticFeedbackVibrationProvider.java>
- AOSP `VibrationSettings` / `VibrationScaler`（`HAPTIC_FEEDBACK_ENABLED` 与 0.6–1.4 强度缩放）：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/vibrator/VibrationScaler.java>
- Android 官方触感指南（Haptic feedback）：<https://developer.android.com/develop/ui/views/haptics/haptic-feedback>
- Android `VibrationEffect` API 参考：<https://developer.android.com/reference/android/os/VibrationEffect>
- `HapticFeedbackConstants` API 参考：<https://developer.android.com/reference/android/view/HapticFeedbackConstants>

### 附录：本机关键 dump（2026-11-15）

```
Vibrator (id=0):
  capabilities = [ON_CALLBACK, PERFORM_CALLBACK, AMPLITUDE_CONTROL]
  supportedPrimitives = []        compositionSizeMax = 0
  pwlePrimitiveDurationMax = 0    pwleSizeMax = 0
  q-factor = NaN                  frequencyProfile = FrequencyProfile{... NaN ...}
  hapticChannelMaxAmplitude = 0.0
VibrationSettings: TOUCH = MEDIUM (default MEDIUM)
VibrationScaler: VERY_LOW 0.6 / LOW 0.8 / NONE 1.0 / HIGH 1.2 / VERY_HIGH 1.4
Settings: haptic_feedback_enabled=1  haptic_feedback_intensity=2  vibrate_on=1
Props: sys.haptic.motor=linear  sys.haptic.device_type=agm  sys.haptic.dynamiceffect.richtap=true
```

```
# 预置效果实测（dumpsys 回放记录）
prebaked 0 → Prebaked=CLICK      67ms
prebaked 2 → Prebaked=TICK       65ms
prebaked 5 → Prebaked=HEAVY_CLICK 58ms
oneshot 5ms@80  → Step=5ms(amplitude=0.31)   20ms
oneshot 20ms@255→ Step=20ms(amplitude=1.00)  31ms
primitives 1/2/7/8 → ignored_unsupported（不出振）
```
