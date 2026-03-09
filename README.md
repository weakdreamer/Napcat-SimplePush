# NapCat SimplePush Plugin

NapCat 群聊消息推送插件 - 简单、可靠的消息推送解决方案

## 功能特性

- **HTTP API 推送**: 通过 HTTP POST 请求推送消息
- **群内命令推送**: 管理员可在群内发送命令推送消息
- **多群推送**: 支持一次推送到所有配置的群聊
- **指定群推送**: 支持按群名称或群号推送
- **WebUI 配置**: 通过 NapCat WebUI 可视化配置

## 安装

1. 下载插件文件到 NapCat 插件目录：
```bash
cd /path/to/napcat/plugins
git clone https://github.com/weakdreamer/Napcat-SimplePush.git napcat-plugin-simplepush
```

或手动创建 `napcat-plugin-simplepush` 文件夹，放入 `index.mjs` 和 `package.json`

2. 重启 NapCat

## 配置

在 NapCat WebUI 中配置：

| 配置项 | 格式 | 示例 |
|--------|------|------|
| 管理员QQ号 | 英文逗号分隔 | `123456789,987654321` |
| 群聊列表 | 每行一个，格式：名称=群号 | `测试群=123456789` |

## 使用方式

### HTTP API

```bash
# 推送到所有群
curl -X POST http://localhost:6099/plugin/napcat-plugin-simplepush/api/push \
  -H "Content-Type: application/json" \
  -d '{"message": "广播消息内容"}'

# 推送到指定群（按名称）
curl -X POST http://localhost:6099/plugin/napcat-plugin-simplepush/api/push \
  -H "Content-Type: application/json" \
  -d '{"target": "测试群", "message": "消息内容"}'

# 推送到指定群（按群号）
curl -X POST http://localhost:6099/plugin/napcat-plugin-simplepush/api/push \
  -H "Content-Type: application/json" \
  -d '{"target": "123456789", "message": "消息内容"}'

# 查看状态
curl http://localhost:6099/plugin/napcat-plugin-simplepush/api/push/status
```

### 群内命令（仅管理员）

```
#推送 消息内容           → 推送到所有群
#推送 测试群 消息内容    → 推送到测试群
#推送 全部 消息内容      → 推送到所有群
#推送                    → 显示帮助
```

## API 说明

### POST /push

推送消息到群聊

**请求体：**
```json
{
  "target": "群名称或群号",  // 可选，不填则推送到所有群
  "message": "消息内容"      // 必填
}
```

**响应：**
```json
{
  "success": true,
  "pushed_to": 2,
  "results": [
    { "group_id": 123456789, "success": true },
    { "group_id": 987654321, "success": true }
  ]
}
```

### GET /push/status

获取插件状态

**响应：**
```json
{
  "version": "1.5.0",
  "admins": [123456789],
  "groups": { "测试群": 123456789 },
  "total_groups": 1
}
```

## License

MIT
