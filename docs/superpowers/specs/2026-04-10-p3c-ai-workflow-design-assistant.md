# P3-C: AI 辅助工作流设计 — 设计文档

> Date: 2026-04-10
> Status: Draft
> Depends on: P3-A (已完成)，可与 P3-B 并行
> Scope: 编辑器内嵌 AI 助手 — 生成、修改、审查 Pipeline YAML

## 1. 核心理念

Pipeline YAML 编写门槛高：需要记住 10 种步骤类型的字段、模板变量语法、触发配置、condition 表达式等。P3-C 让运维人员用自然语言描述需求，AI 生成/修改/审查 Pipeline YAML，降低使用门槛。

**不是对话式 Agent**——P3-C 是编辑器辅助工具，输入是指令，输出是 YAML。不维护多轮对话上下文。

## 2. 三个 AI 能力

### 2.1 生成（Generate）

从自然语言描述生成完整 Pipeline YAML。

```
用户输入: "创建一个每天早8点执行的巡检流水线，并行检查 CPU/内存/磁盘，
          AI 汇总后如果有异常就发 Telegram 通知"

AI 输出: 完整的 YAML（含 name, trigger, params, steps）
```

### 2.2 修改（Modify）

基于指令修改现有 Pipeline YAML。

```
用户输入: "把触发方式从手动改为每6小时一次，并且在安全扫描后加一个审批步骤"
当前 YAML: (编辑器中的内容)

AI 输出: 修改后的完整 YAML
```

### 2.3 审查（Review）

检查 Pipeline YAML 的完整性、最佳实践、安全性。

```
用户输入: (编辑器中的 YAML)

AI 输出: {
  score: 85,
  issues: [
    {severity: "warning", message: "agent 步骤缺少 max_tool_calls 限制"},
    {severity: "info", message: "建议为 shell 步骤添加 timeout"},
  ],
  suggestions: ["考虑在关键操作前添加 approval 步骤"]
}
```

## 3. 架构设计

### 3.1 后端：Prompt 工程 + 验证管线

```
用户指令 + 现有 YAML (可选)
         │
         ▼
┌─────────────────────┐
│  构建 System Prompt   │
│  ├── Pipeline Schema  │  ← 10 种步骤类型 + 字段定义
│  ├── 4 个内置模板     │  ← few-shot 示例
│  ├── 模板变量语法     │  ← {{params.x}}, {{steps.y.output}}
│  └── 最佳实践规则     │  ← 审查用
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  LLM 生成/修改/审查   │  ← get_chat_model("chat") 主力模型
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  后处理 + 验证        │
│  ├── YAML parse 校验  │  ← 语法正确
│  ├── Schema 校验      │  ← 字段合法
│  ├── 引用校验         │  ← step ID、goto 目标存在
│  └── 安全校验         │  ← 无危险命令模式
└─────────┬───────────┘
          │
          ▼
    返回 YAML + 验证结果
```

### 3.2 System Prompt 设计

核心系统提示词（约 3000 token），包含：

```
你是 ServerHub Pipeline YAML 生成助手。

## Pipeline YAML Schema

### 顶层结构
name: 唯一标识（英文、连字符）
display_name: 中文显示名
description: 描述
version: 1
max_concurrent_runs: 1
timeout: 3600
trigger:
  type: manual | cron | alert | api
  cron: "0 8 * * *"         # type=cron 时必填
  alert_rule_id: "..."      # type=alert 时必填
params:
  - name: 参数名
    type: string | number | boolean | array | secret
    required: true
    default: 默认值
    description: 描述

### 10 种步骤类型

#### shell — 执行 Shell 命令
  command: "..."                    # 必填
  timeout: 300

#### ssh — SSH 远程执行
  host: "{{params.target_server}}"  # 必填
  username: "root"
  command: "..."                    # 必填

#### agent — AI 分析（只读）
  prompt: "..."                     # 必填
  output_format: json | text
  max_tool_calls: 20

#### approval — 人工审批
  assignee: admin
  timeout: 3600

#### condition — 条件分支
  expression: "..."                 # 必填，如 "{{steps.scan.output.risk}} >= 3"
  on_true: target-step-id
  on_false: target-step-id

#### parallel — 并行执行
  branches:                         # 必填，子步骤列表
    - id: branch-1
      type: shell
      command: "..."

#### http — HTTP 请求
  url: "..."                        # 必填
  method: GET | POST | PUT | DELETE
  headers: {}
  body: {}

#### notify — 发送通知
  channel: telegram | email | webhook
  message: "..."                    # 支持模板变量

#### delay — 延迟等待
  seconds: 60

#### playbook — 执行 Playbook
  playbook_id: "..."
  params: {}

### 模板变量
{{params.xxx}} — 运行参数
{{steps.xxx.output}} — 步骤输出
{{steps.xxx.output.field}} — 嵌套字段
{{steps.xxx.exit_code}} — 退出码
{{run.id}} — 运行 ID

### on_failure 策略
abort (默认) | skip | notify_continue | goto:{step_id}

## 生成规则
1. 每个步骤必须有唯一 id（英文、连字符）
2. condition 的 on_true/on_false 必须引用有效的 step id
3. 关键操作前建议添加 approval 步骤
4. shell 命令建议设置 timeout
5. agent 步骤的 prompt 要具体明确
6. 输出纯 YAML，不要包含 markdown 代码块标记
```

### 3.3 Few-shot 示例注入

将 4 个内置模板（server-init, auto-heal, daily-patrol, security-scan）的 YAML 注入为示例，让 AI 理解风格和模式。

为控制 token 消耗，根据用户请求**动态选择最相关的 1-2 个模板**作为示例：
- 提到"巡检"/"监控" → daily-patrol
- 提到"安全"/"扫描" → security-scan
- 提到"初始化"/"部署" → server-init
- 提到"故障"/"修复"/"自愈" → auto-heal
- 默认 → daily-patrol（最具代表性）

### 3.4 API 设计

#### 3.4.1 生成

```
POST /api/pipelines/ai/generate
Body: {
    "description": "创建一个每天早8点的巡检流水线...",
    "hints": {                              // 可选，引导生成方向
        "trigger_type": "cron",
        "step_types": ["agent", "parallel", "condition", "notify"]
    }
}

Response: {
    "ok": true,
    "yaml_content": "name: daily-patrol\n...",
    "validation": {
        "valid": true,
        "errors": [],
        "warnings": ["建议为 agent 步骤添加 max_tool_calls 限制"]
    },
    "explanation": "生成了一个包含 5 个步骤的巡检流水线..."
}
```

#### 3.4.2 修改

```
POST /api/pipelines/ai/modify
Body: {
    "yaml_content": "name: my-pipeline\n...",   // 当前 YAML
    "instruction": "把触发方式改为每6小时一次，并在扫描后加审批步骤"
}

Response: {
    "ok": true,
    "yaml_content": "name: my-pipeline\n...",   // 修改后的 YAML
    "validation": { ... },
    "changes": [                                 // AI 描述的改动摘要
        "触发方式从 manual 改为 cron: 0 */6 * * *",
        "在 security-scan 步骤后添加了 admin-approve 审批步骤"
    ]
}
```

#### 3.4.3 审查

```
POST /api/pipelines/ai/review
Body: {
    "yaml_content": "name: my-pipeline\n..."
}

Response: {
    "ok": true,
    "review": {
        "score": 85,                            // 0-100 综合评分
        "issues": [
            {
                "severity": "error",            // error / warning / info
                "step_id": "scan-step",
                "message": "agent 步骤缺少 prompt 字段",
                "suggestion": "添加 prompt: '执行安全扫描...'"
            }
        ],
        "best_practices": [
            "✅ 使用了 approval 步骤保护关键操作",
            "⚠️ 建议为 shell 步骤添加 timeout",
            "⚠️ parallel 分支超过 5 个可能影响性能"
        ]
    }
}
```

### 3.5 不使用流式响应

**决策**：三个 AI 端点使用 request-response 模式，不使用 SSE 流式。

原因：
1. 输出是结构化的 YAML + 验证结果，不是对话文本
2. 生成时间通常 3-8 秒，不需要流式展示
3. 需要完整 YAML 后才能做验证，流式无法提前验证
4. 前端用 loading spinner 即可

如果未来发现 8 秒等待体验不好，可以加 SSE 进度提示（"正在分析需求..." → "正在生成 YAML..." → "正在验证..."），但不流式输出 YAML 本身。

## 4. 前端设计

### 4.1 编辑器工具栏集成

在 EditTab 工具栏区域（当前已有一个 disabled 的"AI 生成"按钮），替换为 3 个功能按钮：

```
┌─────────────────────────────────────────────────────────┐
│ ✓ YAML 有效               [✨ AI 生成] [✏️ AI 修改] [🔍 AI 审查] │ [保存]
└─────────────────────────────────────────────────────────┘
│                                                          │
│  (YAML 编辑器区域)                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 4.2 AI 生成 Modal

```
┌──────────────────────────────────────────┐
│ ✨ AI 生成 Pipeline                       │
│                                          │
│ 描述你想要的流水线:                        │
│ ┌──────────────────────────────────────┐ │
│ │ 创建一个每天早8点执行的巡检流水线，    │ │
│ │ 并行检查 CPU/内存/磁盘，AI 汇总后     │ │
│ │ 如果有异常就发 Telegram 通知          │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ 提示词建议:                               │
│ • 描述触发方式（定时/手动/告警触发）        │
│ • 描述需要检查的内容                       │
│ • 描述异常处理方式（通知/自动修复/审批）     │
│                                          │
│                    [取消]  [🚀 生成]       │
└──────────────────────────────────────────┘
```

生成后：
1. 显示 AI 生成的 YAML 预览（带语法高亮）
2. 显示验证结果（errors/warnings）
3. 显示 Mermaid 流程图预览
4. 用户可选择 [应用到编辑器] 或 [重新生成]

### 4.3 AI 修改 Modal

```
┌──────────────────────────────────────────┐
│ ✏️ AI 修改 Pipeline                       │
│                                          │
│ 当前 Pipeline: daily-patrol v3           │
│                                          │
│ 修改指令:                                 │
│ ┌──────────────────────────────────────┐ │
│ │ 在安全扫描步骤后添加一个审批步骤，     │ │
│ │ 只有管理员确认后才执行修复             │ │
│ └──────────────────────────────────────┘ │
│                                          │
│                    [取消]  [✏️ 修改]       │
└──────────────────────────────────────────┘
```

修改后：
1. 左右 Diff 对比（原 YAML vs 修改后 YAML）
2. AI 改动摘要列表
3. [应用修改] 或 [放弃]

### 4.4 AI 审查面板

审查不用 Modal，用 EditTab 右侧的 inline 面板：

```
┌─────────────────────────┬──────────────────┐
│  (YAML 编辑器)           │  🔍 AI 审查结果   │
│                         │                  │
│  name: my-pipeline      │  评分: 85/100    │
│  ...                    │                  │
│                         │  ❌ 错误 (1)      │
│                         │  • scan 缺少 prompt│
│                         │                  │
│                         │  ⚠️ 建议 (2)      │
│                         │  • 添加 timeout   │
│                         │  • 添加 approval  │
│                         │                  │
│                         │  ✅ 最佳实践      │
│                         │  • 使用了 parallel │
│                         │  • 有 notify 步骤 │
│                         │                  │
│                         │  [关闭审查面板]    │
└─────────────────────────┴──────────────────┘
```

### 4.5 CreateModal 集成

在创建新 Pipeline 时，除了 4 个模板和"空白"选项，增加"AI 生成"选项：

```
┌─────────────────────────────────────────────┐
│  创建新 Pipeline                              │
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 🖥️ 服务器 │ │ 🔧 故障  │ │ 📋 巡检  │       │
│  │ 初始化   │ │ 自愈     │ │ 流水线   │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 🛡️ 安全  │ │ 📄 空白  │ │ ✨ AI    │       │
│  │ 扫描     │ │ Pipeline│ │ 生成     │  ← 新增 │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  [取消]                                      │
└─────────────────────────────────────────────┘
```

点击"AI 生成"→ 打开 AI 生成 Modal → 生成后自动填充到编辑器。

## 5. 后端实现

### 5.1 AI Pipeline 服务

新文件：`modules/pipelines/ai_service.py`

不复用 PipelineAgent（那是运行时只读顾问），而是创建一个轻量级 LLM 调用，专注于 YAML 生成：

```python
"""Pipeline AI 辅助服务 — 生成/修改/审查 YAML

不使用 PipelineAgent（那是运行时顾问）。
直接调用 LLM，注入 Pipeline schema 知识。
"""

async def generate_pipeline(description: str, hints: dict | None = None) -> dict:
    """从自然语言生成 Pipeline YAML"""
    model = get_chat_model("chat")
    prompt = _build_generate_prompt(description, hints)
    response = await model.ainvoke([
        {"role": "system", "content": PIPELINE_AI_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ])
    yaml_content = _extract_yaml(response.content)
    validation = await validate_pipeline_yaml(yaml_content)
    return {
        "yaml_content": yaml_content,
        "validation": validation,
        "explanation": _extract_explanation(response.content),
    }


async def modify_pipeline(yaml_content: str, instruction: str) -> dict:
    """基于指令修改现有 YAML"""
    model = get_chat_model("chat")
    prompt = _build_modify_prompt(yaml_content, instruction)
    response = await model.ainvoke([
        {"role": "system", "content": PIPELINE_AI_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ])
    new_yaml = _extract_yaml(response.content)
    validation = await validate_pipeline_yaml(new_yaml)
    changes = _extract_changes(response.content)
    return {
        "yaml_content": new_yaml,
        "validation": validation,
        "changes": changes,
    }


async def review_pipeline(yaml_content: str) -> dict:
    """审查 Pipeline YAML"""
    model = get_chat_model("chat")
    prompt = _build_review_prompt(yaml_content)
    response = await model.ainvoke([
        {"role": "system", "content": PIPELINE_REVIEW_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ])
    return _parse_review_response(response.content)
```

### 5.2 YAML 提取 + 验证管线

```python
def _extract_yaml(response: str) -> str:
    """从 LLM 响应中提取纯 YAML（去除 markdown 包装）"""
    # 尝试提取 ```yaml ... ``` 块
    match = re.search(r"```ya?ml\s*\n(.*?)```", response, re.DOTALL)
    if match:
        return match.group(1).strip()
    # 尝试整个响应作为 YAML
    try:
        yaml.safe_load(response)
        return response.strip()
    except yaml.YAMLError:
        pass
    # 回退：找到第一个 "name:" 开头的行作为 YAML 起点
    lines = response.split("\n")
    start = next((i for i, l in enumerate(lines) if l.strip().startswith("name:")), 0)
    return "\n".join(lines[start:]).strip()
```

### 5.3 模板选择器

```python
def _select_relevant_templates(description: str) -> list[str]:
    """根据描述选择最相关的 1-2 个模板作为 few-shot"""
    keywords = {
        "server-init": ["初始化", "部署", "上架", "安装", "配置"],
        "auto-heal": ["故障", "修复", "自愈", "告警", "恢复"],
        "daily-patrol": ["巡检", "监控", "检查", "定时", "日常"],
        "security-scan": ["安全", "扫描", "漏洞", "审计", "合规"],
    }
    scores = {}
    for tmpl_id, kws in keywords.items():
        scores[tmpl_id] = sum(1 for kw in kws if kw in description)
    sorted_templates = sorted(scores, key=scores.get, reverse=True)
    # 选择得分 > 0 的前 2 个，至少返回 1 个默认
    selected = [t for t in sorted_templates[:2] if scores[t] > 0]
    return selected or ["daily-patrol"]
```

## 6. 修改清单

### 6.1 后端新增

| 文件 | 职责 |
|------|------|
| `modules/pipelines/ai_service.py` | AI 辅助服务：generate + modify + review |

### 6.2 后端修改

| 文件 | 改动 |
|------|------|
| `modules/pipelines/routes.py` | 实现 `/ai/generate`, `/ai/modify`, `/ai/review` 三个端点 |
| `modules/pipelines/templates.py` | 导出模板 YAML 字符串供 AI prompt 注入 |

### 6.3 前端新增

| 文件 | 职责 |
|------|------|
| `components/pipeline-ai/AIGenerateModal.tsx` | AI 生成 Modal |
| `components/pipeline-ai/AIModifyModal.tsx` | AI 修改 Modal（含 diff 对比） |
| `components/pipeline-ai/AIReviewPanel.tsx` | AI 审查 inline 面板 |

### 6.4 前端修改

| 文件 | 改动 |
|------|------|
| `pages/PipelinesPage.tsx` (EditTab) | 工具栏 3 个 AI 按钮 + Modal/Panel 集成 |
| `pages/PipelinesPage.tsx` (CreateModal) | 新增"AI 生成"选项卡 |
| `api/pipelines.ts` | 新增 3 个 AI API 方法 + 响应类型 |

## 7. 成功标准

1. 用自然语言描述需求，AI 生成有效的 Pipeline YAML
2. AI 生成的 YAML 通过现有验证（语法正确、字段合法）
3. 可基于指令修改现有 YAML，显示改动 diff
4. AI 审查给出评分 + 具体改进建议
5. 生成/修改响应时间 < 10 秒
6. 支持所有 10 种步骤类型的生成
7. 前端 UI 流畅，loading 状态清晰

## 8. 不做的事（YAGNI）

- 不做多轮对话式编辑（每次是独立请求）
- 不做 AI 自动修复审查发现的问题（审查 + 修改是分开的）
- 不做 YAML 实时 AI 补全（tab completion）
- 不做 AI 生成模板（模板是手动维护的）
- 不做流式输出 YAML

## 9. 预估工作量

| 部分 | 工作量 |
|------|--------|
| ai_service.py (prompt + 验证管线) | 2h |
| 三个 API 端点 | 1h |
| AIGenerateModal + 预览 | 2h |
| AIModifyModal + diff 对比 | 2h |
| AIReviewPanel | 1.5h |
| EditTab + CreateModal 集成 | 1h |
| 模板选择器 + 测试 | 0.5h |
| **总计** | **~10h** |
