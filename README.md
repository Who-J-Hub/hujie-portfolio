# H-Jie · 个人作品集

用镜头收集日常，用代码让灵感发生。这里收录 H-Jie 的摄影作品和创意编程实验，也提供本地工具，用来整理照片并生成可上线的网站。

## 可以体验什么

| 页面 | 内容 |
| --- | --- |
| 首页 `/` | 浏览作品入口，切换白天、夜晚或跟随系统，也可以关闭页面动效。 |
| 摄影 `/photography/` | 按分类浏览已发布的照片，在展厅中切换光影。 |
| 代码 `/code/` | 拖动粒子旋转，点击触发爆发，在名字、星系和土星之间切换。 |
| 粒子实验 `/universe/` | 试用自定义文字和更多粒子形态。在支持的浏览器里，可以手动开启摄像头体验手势互动。 |
| 照片管理 `/manage` | 在本机上传、标记、排序和发布照片，或从回收站恢复草稿。 |

## 快速开始

本地服务使用 Python 3.10 或更新版本的标准库。安装 Git 和 Python 后运行下面三条命令。

```bash
git clone https://github.com/Who-J-Hub/hujie-portfolio.git
cd hujie-portfolio
python local_manager.py
```

服务启动后，打开[访客主页](http://127.0.0.1:4173/)或[照片管理页](http://127.0.0.1:4173/manage)。Windows 用户也可以双击 `启动主页.cmd`，它会启动服务并打开管理页。第一次进入管理页时，设置一个至少 8 个字符的密码。

## 管理照片和发布网站

1. 在管理页上传照片，填写标题、分类和说明。新上传的照片从草稿开始。
2. 勾选要展示的照片并保存。打开摄影页预览效果，确认后点击「导出发布包」。
3. 将 `exports/hujie-public-website.zip` 上传到静态网站托管服务。以后调整作品时，重新导出并部署。

原图、展示图、作品目录和密码摘要存放在本机的 `private/`。导出包只收录访客页面和已发布的展示图。备份作品库时，复制整个 `private/` 目录。照片管理、重置密码和部署的完整步骤见[使用说明](使用说明.md)。

## 目录结构

- `public/` 存放摄影、粒子实验和其他访客页面，使用原生 HTML、CSS 和 JavaScript。
- `manager/` 存放本地照片管理界面。
- `local_manager.py` 提供本地预览、登录、照片保存和静态站点导出。

## 许可证

项目原创代码采用 [MIT 许可证](LICENSE)。第三方组件和素材适用各自的许可证：

- [Three.js](https://github.com/mrdoob/three.js) 采用 MIT。原作者声明和许可证位于 [粒子实验页面](public/universe/index.html)。
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 采用 Apache 2.0。[随附许可证](public/particle-assets/mediapipe/LICENSE)。
- MediaPipe 模型包来自 Google 的 [Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) 和 [Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)。[上游模型许可说明](https://github.com/google-ai-edge/mediapipe-samples/issues/407)。
