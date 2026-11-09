# Cloudflare 静态部署评估

> 以下记录部署实施前的评估基线。当前构建与运维方式见 [部署文档](deployment.md)。

评估日期：2026-11-09。目标域名：`draw.thus.chat`。
仓库：<https://github.com/ElioGrove/elio-drawio>。
评估基线：`dev` / `c72c9a98b7a6ce392556ed04c05e0ff19f43f5c3`。

## 结论

可以将浏览器端编辑器部署到 Cloudflare Pages 免费方案。不能直接将 `src/main/webapp` 整体作为公开目录，也不能期待 Pages 执行 Java Servlet。推荐保留现有 fork，通过可重复的构建脚本筛选静态资源到 `dist/`，Pages 仅发布该目录。当前没有为了安全而另建独立源码仓库的必要。

本次为代码与平台可行性评估；不代表完整部署验收，未创建 Cloudflare 项目或更改 DNS。

本地克隆已完成，路径为 `/Users/xiaolin/projects/elio-drawio`。HEAD 与评估基线一致（32.6.10 release）。对当前提交全部 3,144 个受 Git 跟踪文件逐一计算 Git blob SHA-1，与远端目录清单完全一致，零缺失、零差异；`webapp` 无符号链接。OAuth 模板检查亦已在本地复核。仅新增本文档，未改应用源码、提交或推送。

## 证据与容量

- `README.md` 的 Running 部分明确支持 fork 后托管到 GitHub Pages，作为无集成的编辑器使用。
- `index.html` 加载 `js/bootstrap.js` 和 `js/main.js`；`bootstrap.js` 在自定义域名加载 `PreConfig.js`，随后加载已提交的 `app.min.js`，最后加载 `PostConfig.js`。因此基础部署不需要重新编译 Java 或执行 Ant。
- `PreConfig.js` 已设 `DRAWIO_PUBLIC_BUILD = true`、`EXPORT_URL = null`、手动同步。`PostConfig.js` 已禁用图标搜索服务地址。
- `WEB-INF/web.xml` 声明 `/proxy`、`/github2`、`/google`、`/microsoft`、`/gitlab`、`/dropbox`、`/export`、`/service/*` 等 Servlet 路由。这些不是静态文件，Pages 不会实现它们。
- GitHub 完整递归目录清单未截断：整个仓库 3,144 个文件，126,726,144 字节；`webapp` 3,091 个文件，112,334,527 字节（约 107.13 MiB）。
- `WEB-INF` 26 个文件、`META-INF` 1 个文件，合计 4,874,326 字节。仅排除这两个目录后为 3,064 个文件、107,460,201 字节；这只是容量基线，不是最终发布白名单。
- 当前最大静态文件 `js/integrate.min.js` 为 20,616,227 字节（约 19.66 MiB），低于 Pages 的 25 MiB 单文件限制。它属于集成 bundle，普通编辑器首屏不需要；是否删除仍需按产品功能和引用检查决定。

## 功能边界

| 功能 | 纯静态版本 |
| --- | --- |
| 编辑图形、形状库、模板、语言资源 | 可由浏览器和静态资源提供 |
| 打开和保存本地文件、浏览器存储 | 可用，实际能力受浏览器文件 API 与权限约束 |
| XML / drawio / SVG 与浏览器端图像导出 | 可用，远程图片等内容可能受 CORS 和画布限制 |
| PDF | 默认 `EXPORT_URL = null`，通过打印对话框保存 PDF；不是服务端转换服务 |
| Google / GitHub / GitLab / Dropbox / Microsoft 集成 | 首版建议禁用；需要自有应用注册、回调和必要的服务端 token 交换 |
| 远程资源代理、动态图标搜索、服务端导出、AI 等 | 不能由静态托管自动获得，应禁用或另行设计 |
| 实时协同 | README 明确表示本版本不支持实时协同编辑；静态托管不会补齐该能力 |

## OAuth 与发布安全

`WEB-INF` 下存在 Dropbox、GitHub、GitLab、Google、Iconfinder、MSGraph 六组 `client_id` / `client_secret` 文件。本次读取检查确认这些文件当前均为占位模板，未在这十二个文件中发现真实凭据。此结论不等于完整历史及所有第三方资源的秘密扫描。

Java 容器对 `WEB-INF` 的访问保护不能直接套用到普通静态托管。不要依赖目录名称、前端隐藏、robots.txt 或缓存规则保护秘密；不应把这些文件上传到发布产物。

建议发布流程：

1. 保留 `src/main/webapp` 作为上游源码，构建时从明确的目录和文件白名单复制到干净的 `dist/`。
2. 普通编辑器所需资源包括 `index.html`、`js` 中实际使用的 bundle 和懒加载模块、`styles`、`resources`、`images`、`img`、`mxgraph`、`shapes`、`stencils`、`templates`、`math4`，以及文件打开/导入等必要辅助页面。不要仅复制入口 HTML 和 app bundle；模板、图标、字体、导入器等会延迟加载。
3. 明确排除任意层级的 `WEB-INF`、`META-INF`、服务器程序、JAR、环境配置、私钥、凭据文件和不需要的集成入口。源码映射可按需求排除，但这不是秘密保护措施。
4. 对最终产物再校验：禁止服务器目录和符号链接；扫描密钥文件名、私钥块及秘密赋值；统计文件数量和最大文件尺寸；任一检查失败就停止发布。扫描不应在日志中输出秘密值。
5. 修改发布配置：将 `DRAWIO_BASE_URL`、`DRAWIO_LIGHTBOX_URL` 和需要的 viewer 地址设为本站；保留 `EXPORT_URL = null`；禁用云盘与代码托管登录、服务端搜索、AI 和不需要的外部服务。可采用 lockdown 模式降低外部请求，但应检查实际网络行为。
6. 只把 `dist/` 配成 Pages 输出目录，不能使用仓库根目录或未经处理的 `webapp`。根级 `404.html` 应返回明确的 404，避免 Pages 默认 SPA 回退把缺失服务路由伪装成编辑器页面。
7. 真实 OAuth secret 将来只能放入服务端秘密绑定（如 Worker secrets），不得写入 JS、HTML、JSON、构建公开变量或任何静态文件。OAuth client ID 通常是公开标识，不能与 client secret 混淆；没有必要因公开 ID 而判定泄密。

## 是否需要独立仓库

推荐现有 fork + 筛选构建，原因是更新时可以继续合并上游，不需要维护重复的静态资源副本。安全边界是发布产物与构建检查，仓库是否独立本身不能保证不泄密。

独立仓库适合以下明确需求：需要独立发布权限和生命周期、希望下游完全不含 Java 和上游开发工具、需要独立品牌及大量定制。如果以后拆分，建议采用“固定上游提交 + 自动导出 + 来源和许可证记录”的方式，并使用 `main` 作为新仓库默认分支。不要人工删拷几千个文件后失去上游追踪。

本 fork 当前默认分支为 `dev`，本次按实际分支评估；没有擅自改成 `main`。

## Pages 配置与域名

完成筛选构建后建议：Framework preset 为 None，仓库根目录执行构建命令（例如待实现的 `node scripts/build-static.mjs`），输出目录为 `dist`。生产分支应显式选定；现有默认分支为 `dev`。首版不添加 Pages Functions，也不接入付费服务。

先在 Pages 项目的 Custom domains 添加 `draw.thus.chat`，再确认/配置 DNS：`CNAME draw -> <实际项目名>.pages.dev`。若 DNS 由同一 Cloudflare 账户托管，可按控制台提示自动创建。只添加 CNAME 而不在 Pages 关联域名可能导致 522；域名记录应在真实项目名确定后填写。

Cloudflare 当前更推荐新项目使用 Workers Static Assets；它也是可选部署目标。但本项目可以使用 Pages，若用户希望继续使用 Pages，没有为了基础静态编辑器迁移平台的必要。

## 免费额度与成本

截至本次核对，Pages Free 为每站点最多 20,000 个文件、每文件最多 25 MiB，每月 500 次构建、单次构建最多 20 分钟。当前资源规模符合文件数量和单文件大小限制；后续每次更新应重新验证。

不调用 Functions 的静态资源请求免费且不限量。保持纯静态、免费计划、不启用额外付费服务时，不产生按静态请求量收取的 Workers 计算费用；构建或文件上限触达会限制发布，并不意味着自动升级收费。后续若增加 Functions，其调用计入 Workers 配额（Free 当前合计 100,000 次/天）；需要另评估额度与付费触发条件。

官方资料：

- <https://developers.cloudflare.com/pages/platform/limits/>
- <https://developers.cloudflare.com/pages/functions/pricing/>
- <https://developers.cloudflare.com/pages/configuration/custom-domains/>
- <https://developers.cloudflare.com/workers/static-assets/>

## 上线前验收

最终部署产物必须通过目录与凭据检查，并在浏览器确认：首页加载、中文界面、新建/编辑/保存后重新打开、模板和形状库、SVG/PNG/打印 PDF、懒加载导入器、远程图片失败行为、缺失路由返回 404，以及无意外 OAuth/上游服务请求。当前文档不声明这些浏览器端验收已经完成。

保留 Apache 2.0 LICENSE 与第三方资源授权。README 另列出图标/模板使用条款和 draw.io 商标要求；如建立自己的品牌站点，应在发布前处理名称、图标、启动页和第三方声明，避免暗示官方关联。
