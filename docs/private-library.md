# 私有流程库

在 `https://draw.thus.chat/library/` 批量导入、查找、打开、保存和下载原始 .drawio 文件。单文件上限 10 MiB。文件保存在私有 Standard R2 桶 `elio-drawio-files`。名称和最后保存时间随对象存储。

编辑器的「保存」和顶部「手动保存」都会立即提交当前内容。自动同步可以关闭，启用时要求停止修改至少 30 秒，且距打开图或上次保存至少 2 分钟。同步失败会暂停自动重试，可点击手动保存重试。如果其他设备已更新同一文件，界面保留本次修改供下载，不会覆盖云端版本。

## Cloudflare 配置

1. 在 Zero Trust 启用 One-time PIN。创建只包含授权邮箱的可复用 Allow 策略。将策略用于覆盖 `draw.thus.chat` 的自托管应用，并限制该应用使用验证码登录。
2. 为 Pages 生产和预览地址分别启用 Access，或将生产默认地址重定向到自定义域并保护预览地址。备用域名始终不能调用文件 API。
3. 通过 Pages 的生产环境 Secret 配置 `ACCESS_ISSUER=https://<团队>.cloudflareaccess.com`、`ACCESS_AUD=<自定义域 Access 应用的 AUD>`、`ACCESS_EMAIL=<允许登录的邮箱>`。Wrangler 已声明 `ACCESS_HOST=draw.thus.chat`。Functions 按签名、签发者、受众、有效期和邮箱检查 Access JWT。配置不完整时拒绝访问。
4. 仓库的 Wrangler 配置绑定私有 R2 桶。推送生产分支 `main` 触发 Cloudflare Pages 原生 Git 部署。文件路由限定为 `/api/diagrams`。
5. 先确认未登录不能读取数据，再用授权邮箱登录并导入样例，在另一设备打开。测试两个编辑会话保存同一文件时，较旧版本收到冲突提示。

R2 Standard 账户共享免费额度。超过免费额度后按量计费。首版通过按需列表请求、同步间隔和文件大小上限控制使用量。
