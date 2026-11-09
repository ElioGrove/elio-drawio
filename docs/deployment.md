# Elio Draw 静态部署

站点域名：`https://draw.thus.chat`。保留 draw.io fork 的上游目录，通过白名单构建生成 `dist/`，不直接发布 `src/main/webapp`。

## 本地

使用 Node.js 22 或更新版本：

```sh
npm ci
npm test
npm run build
npm run check
npm run preview
```

预览地址为 `http://localhost:8788`。`dist/`、中间目录和本地秘密文件均已加入 `.gitignore`。

## Cloudflare Pages

- 仓库：`ElioGrove/elio-drawio`；生产分支：`main`。
- 项目名：`elio-drawio`；Framework：None；Root directory：仓库根目录。
- 构建命令：`npm test && npm run build`；输出目录：`dist`。
- Node.js：22 或更新版本。不要添加任何 OAuth secret 构建变量。
- 不配置 Functions、数据库或存储服务，保持免费纯静态托管。
- Git 集成自动构建；也可在已登录的同一账户运行 `npm run deploy` 手动上传同一产物。
- 在项目 Custom domains 中关联 `draw.thus.chat`，并确认 DNS CNAME 指向实际 Pages 项目域名。

## 发布边界

`scripts/build-static.mjs` 只复制编辑器需要的静态目录、生产 bundle、导入器、模板、形状、字体和许可证。保留源码中的服务器目录便于同步上游，但不复制到产物；开发源码、云集成专用 bundle、OAuth 回调页面和旧 service worker 也不发布。

`deploy/static` 提供本站配置。基础链接、分享查看器和 HTML 导出引用本站；采用 Elio Draw 名称，保留上游默认图标和启动标识。默认语言为简体中文，仍尊重用户显式选择的语言与已保存的语言偏好。`lockdown` 模式关闭云盘、代码托管登录、动态搜索、AI、插件和服务端导出。PDF 使用浏览器打印，图像/SVG/XML 导出在本地执行。CSP 只允许本站、data/blob 所需资源，因此外部图片和网络字体也被阻止；需要使用图片时请导入本地文件。站点并非所有功能都与上游在线服务等同。

上游的离线模式也会隐藏模板选择器。本站仅覆盖“新建”对话框，允许加载随站点发布的 `templates/index.xml` 和本地模板，不改变其余网络操作的离线判定。构建会确保 PostConfig 在 App 初始化前加载，避免配置顺序受网络和缓存时序影响。

关键启动脚本使用由内容计算的版本参数，静态资源响应要求缓存重验证。这样即使浏览器之前缓存了旧配置，也会在部署更新后加载对应的新启动代码。不要为这个子域设置覆盖本站缓存策略的长期缓存规则。

发布前自动拒绝：服务器目录、凭据文件、私钥/常见 token/OAuth secret 字面量、符号链接、超出 Pages Free 限制的文件及数量。扫描只报告文件路径，不输出密钥值。扫描是防线之一，不能替代秘密管理和代码审核。检测失败会删除候选产物和旧 `dist/`，防止继续误发旧产物。

`404.html` 保证不存在的服务器端点和敏感路径返回 404；不会回退到编辑器 HTML。真实 secret 将来只能由服务端管理，不能写入任何浏览器配置或打包变量。

## 更新上游

合并上游到 `main` 后，运行上述检查，再验证首页、绘图、中文、模板、文件保存/重新打开、PNG/SVG/XML 导出、打印 PDF 和缺失路径 404。构建对 bootstrap 注入点有检查；上游改变启动流程时会中止，需要复核。不要把 `dist/` 提交到 Git。

保留根 LICENSE 与各资源目录内授权。产物提供 LICENSE 和 THIRD-PARTY-NOTICES.md；本部署不暗示与上游有官方关联。
