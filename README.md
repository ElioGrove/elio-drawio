# draw.io

## Elio Draw deployment

This fork provides a local-first static deployment at **https://draw.thus.chat**.
See [deployment instructions](docs/deployment.md) for the safe Pages build, feature boundaries, and upstream update process. Only generated `dist/` assets are published; server directories and OAuth credentials are excluded.

## About

draw.io is a configurable diagramming and whiteboarding application, jointly owned and developed by draw.io Ltd (previously named JGraph) and draw.io AG. We also run a production deployment at https://app.diagrams.net.

## License

The source code in this repository is licensed under the [Apache License 2.0](LICENSE).

The icon sets, stencil libraries, and diagram templates are provided under the following terms:

> The icon sets and stencil libraries included in this software, and any derivatives thereof (including conversions to other formats, traced reproductions, substantially similar visual representations, or AI-generated images created using these icons as reference or training input), may not be used as software assets in, distributed for use with, or incorporated into Atlassian products or products distributed through the Atlassian marketplace or plugin ecosystem, without explicit written permission.
>
> This restriction does not apply to end-user diagram output (such as exported images or documents) created using this software.

Some icons are originally defined by third-party copyright holders; we have verified that all original licenses permit use in this project. Additional third-party JavaScript libraries are included, all with licenses compatible with Apache 2.0 (no GPL or AGPL).

We make no copyright claim on diagrams you create with this software.

## Contributions

We do not accept pull requests. The project is developed entirely by the core team.

## Scope

draw.io is a diagramming and whiteboarding application. It is not an SVG editor. SVG export is intended for embedding in web pages, not for editing in other tools.

Note that draw.io does not support real-time collaborative editing in this version, currently.

For issues or questions about the editor in any draw.io product, the issue tracker and discussions here are a good starting point.

## Running

This repository is a test version of draw.io, for evaluating draw.io and trying it out. A paid production version is available for production deployments.

Options for running the test version:

- Fork this repository and [publish to GitHub Pages](https://help.github.com/categories/github-pages-basics/) for an [editor](https://jgraph.github.io/drawio/src/main/webapp/index.html) without integrations
- Use the [Docker image](https://github.com/jgraph/docker-drawio)
- Use the packaged .war files on the [releases page](https://github.com/jgraph/draw.io/releases)

For the desktop app, download [draw.io Desktop](https://get.diagrams.net).

## Supported Browsers

Chrome 123+, Firefox 120+, Safari 17.5+, Opera 109+, Edge 123+, WebView Android 137+, Safari iOS 18.5+.

## Trademark

draw.io is a registered EU trademark (#018062448).

Do not use the draw.io name or logo in ways that suggest affiliation with, endorsement by, or sponsorship by draw.io. Do not use draw.io logos for your own business, product, project, domain, or social media presence. Do not modify the draw.io logos. Use of draw.io trademarks requires prior written permission.

## 统一安全策略

本项目与其他 ElioGrove 私有应用共用同一套登录与会话安全策略：

- **密码校验**：服务端使用常量时间比对（SHA-256 摘要 / PBKDF2），建议使用 20 位以上高熵随机密码作为管理密码 Secret。
- **单 IP 阶梯限流（仅计失败）**：
  - 按 `CF-Connecting-IP` 的 SHA-256 哈希计数（不存储明文 IP）。
  - 登录成功立即清零该 IP 失败计数；每满 **5 次** 失败（第 5、10 次）锁定 **15 分钟**；累计 **15 次** 及以上失败锁定 **60 分钟**（24 小时无失败自动衰减）。
  - 锁定期间返回 `429 Too Many Requests` 并附带 `Retry-After` 响应头。
- **全局分布式熔断**：任意 **1 分钟** 内全站累计失败达到 **30 次** 时触发短时熔断（返回 `429` + `Retry-After`），防止多 IP 代理池撞库消耗 Worker/D1/KV 配额。
- **会话与 CSRF 防护**：
  - 会话密钥或签名与当前管理员密码绑定，修改管理员密码后旧会话立即失效。
  - Cookie 统一使用 `HttpOnly; Secure; SameSite=Strict`；登录、退出及变更接口强制同源 `Origin` 校验并附带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`。
- **公开图标放行**：仅放行站点 `favicon` 图标路径用于浏览器标签与导航站自动抓取，其余页面与 API 严格鉴权。
- **边缘层防护建议**：在 Cloudflare WAF 为登录接口（`POST /auth/login`、`POST /api/login`、`POST /api/auth/login`、`POST /login`）配置 Rate Limiting 规则作为第一道防线。
