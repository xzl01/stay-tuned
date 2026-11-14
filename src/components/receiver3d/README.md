# 原位三维收音机

由 `Receiver3DEasterEgg.tsx` 中的动态导入加载，替换 `Receiver.tsx` 的原有收音机区域。不得从主入口静态导入此目录的运行时代码，否则会破坏默认不加载的约束。

- `Receiver3DView.tsx`：连接 AppStore，在外观 / 状态改变时更新场景；退出时销毁。
- `scene.js`、`scene.d.ts`：程序化网格、材质、射线交互与资源生命周期。
- `receiver3d.css`：仅随彩蛋加载的视图样式。
- `vendor/`：固定 Three.js 0.180.0 及所需的三个 addon，MIT 授权见 `vendor/THREE-LICENSE.txt`。只将 addon 的 `three` 导入改为本地相对路径，以供 Vite 打包；没有安装或引用运行时 CDN。

字体复用主播放器的自托管 Fusion Pixel。无独立音源、模拟计时器或全局模型实例；时间、章节、音量与播放状态均由 AppStore 提供。

卸载时停止动画循环，移除 ResizeObserver 和事件监听，销毁网格、纹理、材质、阴影和环境渲染目标，释放 WebGL 上下文。重新启用创建新的场景，保持模块缓存。
