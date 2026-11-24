# 胡杰的作品网站

个人作品集，包含摄影展厅、交互式粒子实验和仅在本机运行的照片管理工具。

## 本地运行

使用 Python 3.10 或更新版本，在项目目录运行：

```sh
python local_manager.py
```

- [访客主页](http://127.0.0.1:4173/)
- [照片管理](http://127.0.0.1:4173/manage)

首次打开照片管理页时可以设置管理员密码。照片和管理数据保存在本机的 `private/`。公开部署时，从管理页导出访客版 ZIP。操作步骤见[使用说明](使用说明.md)。

## 许可证

项目原创代码采用 [MIT 许可证](LICENSE)。第三方组件和素材适用各自的许可证：

- [Three.js](https://github.com/mrdoob/three.js) 采用 MIT。原作者声明和许可证位于 [粒子实验页面](public/universe/index.html)。
- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 采用 Apache 2.0。[随附许可证](public/particle-assets/mediapipe/LICENSE)。
- MediaPipe 模型包来自 Google 的 [Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) 和 [Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)。[上游模型许可说明](https://github.com/google-ai-edge/mediapipe-samples/issues/407)。
