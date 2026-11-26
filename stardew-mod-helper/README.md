# 星露谷模组下载助手（Stardew Mod Helper）

一个可在 iOS Safari「添加到主屏幕」后全屏使用的 PWA 小工具，用于管理星露谷模组。

## 功能

- **N 网下载**：输入 Nexus Mods API Key，粘贴模组 ID / 链接（支持多个混排），查看文件、汉化、前置，Premium 一键直下 / 非会员优雅降级
- **模组库管理**：上传模组文件夹压缩包，自动解析 manifest；层级文件夹浏览（类 iOS 文件 App），支持新增 / 重命名 / 删除文件与文件夹
- **本地持久化**：模组库存放在浏览器 IndexedDB，刷新 / 关闭后仍在
- **GitHub 云端**：可配置自己的 fine-grained PAT + 私有仓库，手动同步 / 拉取模组，永不失效、跨设备管理
- **按 ID 勾选**：粘贴一组 ID 自动勾选对应模组，一键打包下载
- **更新检测**：基于 manifest 的 UpdateKeys，提示「已是最新版 / 有新版本」
- **清单导出**：模组库导出 Markdown / JSON / CSV
- **下载历史**：v1 已有的历史记录、搜索、筛选、再次下载、导出

## 技术栈

Vite + React + TypeScript + Tailwind CSS + vite-plugin-pwa + JSZip，纯前端无后端。

## 本地开发

```bash
npm install
npm run dev      # 开发
npm run build    # 构建，产物在 dist/
npm test         # 测试
```

## 隐私说明

- N 网 API Key 与 GitHub PAT 仅存本机 localStorage，绝不上报服务器、不进日志
- 模组文件默认只在本地浏览器处理；只有主动点击「同步到云端」时，才会把文件发送到你自己配置的 GitHub 私有仓库
- 本工具不含任何后端，无第三方埋点

## 在线使用

打开部署地址后，用 iPhone Safari「分享 → 添加到主屏幕」即可像 App 一样全屏运行。
