# Node API 示例项目

此项目演示一个使用 ES6 语法实现的 Node.js API 服务，主要特性：

- 自动加载 `apps/` 目录中的路由模块
- 基于 CPU 与内存动态限制访问
- IP 黑名单、API Key 验证、高危 UA 拦截
- 日志分级记录并按天存储，保留 30 天
- 每个路由调用次数统计
- 所有配置集中在 `config/config.yaml`
- 输出 JSON 自动美化

## 启动

```bash
npm install
npm start
```

服务默认监听 `config/config.yaml` 中的端口 (默认 3000)。

## 目录结构

```
apps/        API 路由实现
config/      配置文件
middleware/  中间件
utils/       工具与日志
logs/        日志目录
```
