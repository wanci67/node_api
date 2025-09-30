# Secure Node API 平台

该项目基于 Node.js 20+、Express、Redis、MySQL 构建，提供一套模块化、可审计且具备多重安全防护措施的企业级接口平台。项目遵循 Airbnb JavaScript 规范，集成 ESLint + Prettier 统一代码风格，核心特性包括：

- **多进程集群**：主进程自动派生工作进程，充分利用多核 CPU。
- **安全防护**：集成 Helmet、CSRF 双重提交校验、XSS 清洗、CC 限流、IP 黑白名单、签名+令牌鉴权等机制。
- **数据校验**：所有外部输入通过 Joi 严格校验，SQL 均使用参数化查询避免注入。
- **缓存架构**：Redis + 内存双层缓存，支持高频数据加速与接口统计持久化。
- **日志审计**：Winston 分级日志，操作写入审计表，记录请求上下文，便于追溯。
- **自动统计**：动态收集接口调用量、成功率、IP 数等指标，实时生成 `data/api-interfaces.json`。
- **APM 接入**：可选 Elastic APM 监控应用性能并分析事务链路。
- **运维接口**：内置用户、密钥、授权码、黑名单等管理 API。
- **浏览器截图**：基于 Puppeteer 渲染网页并返回 Base64/二进制截图。

## 目录结构

```
├── app.js                # Express 应用初始化
├── index.js              # Cluster 启动入口
├── apps/                 # 各业务模块路由
├── middlewares/          # 中间件：安全、认证、统计等
├── models/               # 核心模块：Redis、MySQL、日志、授权等
├── services/             # 业务服务：用户等
├── utils/                # 工具函数
├── web/                  # 前端控制台与示例脚本
├── data/api-interfaces.json # 接口统计输出
└── config/               # 配置加载与 APM 初始化
```

## 快速开始

1. 按照 `.env.example` 创建 `.env` 文件，填写数据库、Redis、JWT 等敏感配置。
2. 安装依赖：`npm install`
3. 初始化数据库表结构（示例可参考 `models` 与 `services` 中字段定义）。
4. 启动服务：`npm start`
5. 打开 `http://localhost:8080/web/` 体验前端控制台。

> **注意**：若在离线或受限网络环境下无法安装 NPM 依赖，请在具备官方源访问权限的环境中执行安装。

## 常用脚本

- `npm run lint`：执行 ESLint 检查。
- `npm run lint:fix`：自动修复可修复的风格问题。
- `npm run format`：运行 Prettier 美化代码。

## 安全建议

- 在生产环境中务必替换 `.env.example` 中的所有默认密钥。
- 使用 HTTPS 部署，并在反向代理层启用安全头透传。
- 定期执行 `npm audit` 并更新依赖包，修复潜在漏洞。
- MySQL、Redis 建议使用专用子网，并结合安全组/防火墙限制访问。

