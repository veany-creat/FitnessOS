# Fitness OS

面向 iPhone Safari、主屏幕 PWA 与桌面浏览器的轻量健身行动应用。项目使用原生 HTML、CSS 和 JavaScript，无外部依赖。

## 本地预览

在项目目录启动任意静态文件服务器，例如：

```bash
python3 -m http.server 4173
```

然后访问 `http://localhost:4173/`。Service Worker 需要通过 `localhost` 或 HTTPS 运行，直接双击 HTML 文件时不会启用离线缓存。

## GitHub Pages 部署

1. 将仓库内容推送到 `veany-creat/FitnessOS` 的默认分支。
2. 打开仓库 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**。
4. 选择默认分支与 `/(root)`，保存。
5. 发布完成后访问 `https://veany-creat.github.io/FitnessOS/`。

所有站内资源、PWA 起始地址和离线缓存路径均为相对路径，可兼容 GitHub Pages 子目录部署。
