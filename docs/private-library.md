# 私有流程库

在 `https://draw.thus.chat/library/` 批量导入、查找、打开、保存和下载原始 .drawio 文件。单文件上限 10 MiB。文件保存在私有 Standard R2 桶 `elio-drawio-files`。名称和最后保存时间随对象存储。

编辑器的「保存」和顶部「手动保存」都会立即提交当前内容。自动同步可以关闭，启用时要求停止修改至少 30 秒，且距打开图或上次保存至少 2 分钟。同步失败会暂停自动重试，可点击手动保存重试。如果其他设备已更新同一文件，界面保留本次修改供下载，不会覆盖云端版本。

## Cloudflare 配置

整站由 Pages Functions 验证密码。生产 Secret `ADMIN_PASSWORD` 至少 20 个字符。专属 D1 库存储会话摘要与登录限流记录，部署前执行 `wrangler d1 migrations apply DB --remote`。在 Pages 设置中将免费请求耗尽时的行为设为 Fail closed。生产入口为 draw.thus.chat，备用主机拒绝访问。会话有效期七天，访问 /auth/logout 可退出。

R2 Standard 账户共享免费额度。超过免费额度后按量计费。首版通过按需列表请求、同步间隔和文件大小上限控制使用量。
