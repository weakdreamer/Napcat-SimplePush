/**
 * NapCat SimplePush Plugin v1.5.0
 * 群聊消息推送插件 - 支持HTTP API和群内命令推送
 * 
 * GitHub: https://github.com/weakdreamer/Napcat-SimplePush
 */

import fs from 'fs';

let logger = null;
let actions = null;
let adapterName = null;
let pluginManager = null;
let configPath = null;

// 配置
let config = {
  commandPrefix: "#推送",
  apiToken: "",
  adminsText: "",
  groupsText: "",
};

// 配置界面（在 plugin_init 中初始化）
let plugin_config_ui = [];

// 解析后的缓存
let parsedAdmins = [];
let parsedGroups = {};

// 加载配置
const loadConfig = () => {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      config = { ...config, ...saved };
      parseConfig();
      logger?.info("[SimplePush] 配置已加载");
    }
  } catch (e) {
    logger?.warn("[SimplePush] 加载配置失败:", e.message);
  }
};

// 保存配置
const saveConfig = () => {
  try {
    const dir = configPath.substring(0, configPath.lastIndexOf('/'));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    parseConfig();
    logger?.info("[SimplePush] 配置已保存");
  } catch (e) {
    logger?.error("[SimplePush] 保存配置失败:", e.message);
  }
};

// 解析配置
const parseConfig = () => {
  parsedAdmins = config.adminsText
    .split(',')
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n));
  
  parsedGroups = {};
  config.groupsText.split('\n').forEach(line => {
    const [name, id] = line.split('=').map(s => s.trim());
    if (name && id && !isNaN(parseInt(id))) {
      parsedGroups[name] = parseInt(id);
    }
  });
};

// 辅助函数
const getAllGroupIds = () => Object.values(parsedGroups);

const resolveGroups = (target) => {
  if (!target || target === "全部" || target === "all") {
    const ids = getAllGroupIds();
    return ids.length > 0 ? ids : null;
  }
  if (parsedGroups[target]) return [parsedGroups[target]];
  const groupId = parseInt(target);
  if (!isNaN(groupId)) return [groupId];
  return null;
};

const isAdmin = (userId) => parsedAdmins.includes(userId);

const validateToken = (req) => {
  if (!config.apiToken) return true;
  const token = req.headers["x-access-token"] || req.query.token;
  return token === config.apiToken;
};

// 发送消息
const sendGroupMsg = async (groupId, message) => {
  if (!actions) return false;
  try {
    await actions.call("send_group_msg", {
      group_id: String(groupId),
      message: message,
    }, adapterName, pluginManager?.config);
    logger?.info(`[SimplePush] 成功 -> 群${groupId}`);
    return true;
  } catch (err) {
    logger?.error(`[SimplePush] 失败 -> 群${groupId}: ${err.message}`);
    return false;
  }
};

const pushMessage = async (groupIds, message) => {
  const results = [];
  for (const groupId of groupIds) {
    const success = await sendGroupMsg(groupId, message);
    results.push({ group_id: groupId, success });
  }
  return results;
};

const sendReply = async (event, message) => {
  if (!actions) return;
  const params = {
    message,
    message_type: event.message_type,
    ...(event.message_type === "group" && event.group_id ? { group_id: String(event.group_id) } : {}),
    ...(event.message_type === "private" && event.user_id ? { user_id: String(event.user_id) } : {})
  };
  try {
    await actions.call("send_msg", params, adapterName, pluginManager?.config);
  } catch (error) {
    logger?.error("[SimplePush] 发送回复失败:", error.message);
  }
};

// ==================== 插件生命周期 ====================

const plugin_init = async (ctx) => {
  logger = ctx.logger;
  actions = ctx.actions;
  adapterName = ctx.adapterName;
  pluginManager = ctx.pluginManager;
  configPath = ctx.configPath;

  loadConfig();

  // 初始化配置界面
  plugin_config_ui = ctx.NapCatConfig.combine(
    ctx.NapCatConfig.html('<div style="padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white; margin-bottom: 16px;"><h3 style="margin: 0;">📢 SimplePush 群聊推送插件</h3><p style="margin: 8px 0 0; opacity: 0.9;">通过 HTTP API 或群内命令推送消息到指定群聊</p></div>'),
    
    ctx.NapCatConfig.text("commandPrefix", "群命令前缀", "#推送", "群内触发推送的命令前缀"),
    ctx.NapCatConfig.text("apiToken", "API 访问令牌", "", "留空则不验证（不建议生产环境留空）"),
    
    ctx.NapCatConfig.html('<hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;">'),
    
    ctx.NapCatConfig.html('<div style="background: #f0f7ff; padding: 10px; border-radius: 6px; margin-bottom: 8px;"><b>👥 管理员QQ号</b><br><small style="color: #666;">多个用英文逗号分隔，如：123456789,987654321</small></div>'),
    ctx.NapCatConfig.text("adminsText", "管理员列表", "", ""),
    
    ctx.NapCatConfig.html('<hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;">'),
    
    ctx.NapCatConfig.html('<div style="background: #f0fff7; padding: 10px; border-radius: 6px; margin-bottom: 8px;"><b>📢 群聊列表</b><br><small style="color: #666;">每行一个，格式：名称=群号<br>例如：测试群=123456789</small></div>'),
    ctx.NapCatConfig.text("groupsText", "群聊配置", "", "每行一个：名称=群号")
  );

  // API 路由
  ctx.router.postNoAuth("/push", async (req, res) => {
    if (!validateToken(req)) {
      return res.status(401).json({ error: "无效的访问令牌" });
    }
    
    const { target, message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "缺少 message 参数" });
    }
    
    const groupIds = resolveGroups(target);
    if (!groupIds || groupIds.length === 0) {
      return res.status(400).json({ 
        error: `无效的目标或未配置群聊`,
        available_groups: parsedGroups,
      });
    }
    
    const results = await pushMessage(groupIds, message);
    
    res.json({
      success: true,
      pushed_to: groupIds.length,
      results: results,
    });
  });
  
  ctx.router.getNoAuth("/push/status", async (req, res) => {
    res.json({
      version: "1.5.0",
      admins: parsedAdmins,
      groups: parsedGroups,
      total_groups: Object.keys(parsedGroups).length,
    });
  });

  logger.info("========================================");
  logger.info("SimplePush 群聊推送插件已加载 v1.5.0");
  logger.info("========================================");
  logger.info(`管理员: ${parsedAdmins.join(", ") || "未配置"}`);
  logger.info(`群聊配置:`);
  for (const [name, id] of Object.entries(parsedGroups)) {
    logger.info(`  ${name}: ${id}`);
  }
  logger.info(`群命令: ${config.commandPrefix} <消息>`);
  logger.info("========================================");
};

const plugin_get_config = async () => ({ ...config });

const plugin_set_config = async (_ctx, newConfig) => {
  if (newConfig.commandPrefix !== undefined) {
    config.commandPrefix = String(newConfig.commandPrefix) || "#推送";
  }
  if (newConfig.apiToken !== undefined) {
    config.apiToken = String(newConfig.apiToken);
  }
  if (newConfig.adminsText !== undefined) {
    config.adminsText = String(newConfig.adminsText);
  }
  if (newConfig.groupsText !== undefined) {
    config.groupsText = String(newConfig.groupsText);
  }
  saveConfig();
  return { success: true };
};

// 消息处理
const plugin_onmessage = async (_ctx, event) => {
  if (event.message_type !== "group") return;
  
  const { user_id, raw_message } = event;
  
  if (!raw_message?.startsWith(config.commandPrefix)) return;
  
  if (_ctx.actions) actions = _ctx.actions;
  if (_ctx.adapterName) adapterName = _ctx.adapterName;
  if (_ctx.pluginManager) pluginManager = _ctx.pluginManager;
  
  if (!isAdmin(user_id)) {
    logger?.warn(`[SimplePush] 非管理员尝试使用命令: ${user_id}`);
    return;
  }
  
  const content = raw_message.slice(config.commandPrefix.length).trim();
  if (!content) {
    const groupList = Object.entries(parsedGroups)
      .map(([name, id]) => `  ${name}: ${id}`)
      .join("\n") || "  未配置群聊";
    await sendReply(event, 
      `📢 SimplePush 使用说明\n\n` +
      `命令格式:\n` +
      `  ${config.commandPrefix} 消息内容        (推送到所有群)\n` +
      `  ${config.commandPrefix} <群名> 消息内容  (推送到指定群)\n\n` +
      `已配置群聊:\n${groupList}\n\n` +
      `管理员: ${parsedAdmins.join(", ") || "未配置"}`
    );
    return;
  }
  
  const parts = content.split(/\s+/);
  let target = null;
  let message = content;
  
  const firstWord = parts[0];
  const groupIds = resolveGroups(firstWord);
  
  if (groupIds && parts.length > 1) {
    target = firstWord;
    message = parts.slice(1).join(" ");
  } else {
    target = "all";
  }
  
  const targetGroups = resolveGroups(target);
  if (!targetGroups || targetGroups.length === 0) {
    await sendReply(event, `❌ 未配置任何群聊`);
    return;
  }
  
  await sendReply(event, `⏳ 正在推送到 ${targetGroups.length} 个群...`);
  const results = await pushMessage(targetGroups, message);
  
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  await sendReply(event, `✅ 推送完成: 成功 ${success}, 失败 ${failed}`);
};

export { 
  plugin_init, 
  plugin_onmessage, 
  plugin_config_ui, 
  plugin_get_config, 
  plugin_set_config 
};
