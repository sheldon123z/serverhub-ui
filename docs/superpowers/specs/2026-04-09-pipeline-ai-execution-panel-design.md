# Pipeline AI 智能执行系统 — 设计文档 v2

> Date: 2026-04-09
> Status: Draft (v2 — 修正与代码对齐)
> Scope: P3-A (AI 执行面板) + P3-B/C 接口预留

## 1. 核心理念

Pipeline = **结构化的 DAG 框架** + **AI 在标记节点灵活决策** + **运维人员全程可交互**

Pipeline 不是纯自动化脚本，也不是纯 AI 对话。它是一个 **AI 增强的运维 SOP 执行器**：框架固定保证可重复性，AI 介入保证灵活性，人类决策保证安全性。

## 2. 三阶段交付计划

| 阶段 | 交付内容 | 依赖 |
|------|---------|------|
| **P3-A** | AI 执行面板 + 前置重构（Agent 工厂扩展 + 组件解耦） | 无 |
| **P3-B** | 智能介入机制：`decision` 步骤类型 + AI 主动触发人类介入 | P3-A |
| **P3-C** | AI 辅助工作流设计：编辑器内嵌 AI 助手 | P3-A (可与 B 并行) |

## 3. 架构原则：共享基础设施，独立业务层

```
┌─────────────────────────────────────────────────────────┐
│                  独立业务层 (Pipeline AI)                 │
│                                                         │
│  PipelineAgent                                          │
│  ├── 独立系统提示词（工作流执行 + 只读顾问导向）           │
│  ├── 独立工具子集（SAFE_TOOLS 只读白名单 + pipeline 专属） │
│  ├── 独立对话存储（pipeline_chat_events 表）              │
│  ├── 独立 SSE 事件扩展（统一走 /stream 单通道）           │
│  ├── 独立 API 端点（/api/pipelines/runs/{id}/chat）      │
│  ├── 独立中间件栈（精简，无 Filesystem / HumanInTheLoop） │
│  └── 双 Thread 模型（执行 thread + 操作员 chat thread）   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                  共享基础设施层                            │
│                                                         │
│  ├── StreamBridge（SSE 事件传输）                         │
│  ├── LLM 注册表（llm.py，8 家服务商）                    │
│  ├── create_deep_agent() 底层 API（非 build_agent 缓存层）│
│  ├── UI 纯渲染组件（从 Agent 页面抽取的无状态版本）        │
│  ├── 通用工具库（按 SAFE_TOOLS 白名单引入）               │
│  └── DbWriteBuffer（批量数据库写入）                      │
└─────────────────────────────────────────────────────────┘
```

### 3.1 主 Agent vs Pipeline Agent 对比

| 维度 | 主 Agent (Agent 页面) | Pipeline Agent (Pipeline 页面) |
|------|---------------------|-------------------------------|
| 使命 | 通用运维助手，开放式对话 | 工作流只读顾问 + AI 审查节点执行 |
| Agent 构建 | `build_agent()` 缓存层 | `create_pipeline_agent()` 直接调用 `create_deep_agent()` |
| 系统提示词 | 通用运维知识 + 服务器记忆 | 当前 Pipeline 上下文 + 前序输出 + 只读约束 |
| 工具集 | 完整 50+ (core + deferred) | SAFE_TOOLS 只读白名单 (27 个) + 2 个 pipeline 专属 |
| 安全模式 | supervised (危险操作需审批) | **只读顾问模式**（无写入工具，无需审批语义） |
| 对话存储 | `agent_conversations` + `agent_runs` | `pipeline_chat_events` 表 (append-only) |
| SSE 通道 | `/api/agents/chat` 独立流 | 统一进 `/api/pipelines/runs/{id}/stream` |
| 中间件 | 完整 13 层 | 精简：ModelRetry + ToolRetry + ModelCallLimit + ContextEditing |

## 4. P3-A 详细设计：AI 执行面板

### 4.1 用户体验

Pipeline 运行时，右栏面板升级为混合执行面板：

```
┌──────────────────────────┐
│  Pipeline 运行 #run-abc   │  ← 标题栏：运行 ID + 状态 + 耗时
│  ● 运行中  00:01:23       │
├──────────────────────────┤
│                          │
│  ✓ 连通性检查     2.1s   │  ← 程序化状态条目（快速、零 token）
│  ✓ 安装 Docker   15.3s   │
│  ▶ AI 安全审查    进行中  │  ← AI 节点：展开为对话区域
│  ┌────────────────────┐  │
│  │ 🤖 扫描完成，发现：  │  │  ← AI 消息（纯渲染组件）
│  │ • 端口 8080 开放    │  │
│  │ • SSH 允许密码登录  │  │
│  │                    │  │
│  │ 建议采取措施：      │  │
│  │ ┌─────┐ ┌───────┐ │  │  ← 决策选项（P3-B 预留）
│  │ │关闭  │ │保留   │ │  │
│  │ └─────┘ └───────┘ │  │
│  └────────────────────┘  │
│  ○ 配置防火墙    待执行   │  ← 后续步骤（灰色）
│  ○ 完成通知      待执行   │
│                          │
├──────────────────────────┤
│ 💬 输入消息或提问...      │  ← 输入框（只读顾问能力）
└──────────────────────────┘
```

### 4.2 面板的两种状态

**A) 运行时状态**（Pipeline 正在执行）：
- 上方：实时步骤状态流（程序化输出）
- 中间：当前 AI 步骤的对话内容（如果正在执行 AI 步骤）
- 下方：输入框可用，用户可以随时提问（只读查询，不执行写操作）

**B) 空闲状态**（Pipeline 未运行或运行结束）：
- 显示最近一次运行的步骤结果和 AI 对话历史（从 pipeline_chat_events 加载）
- 输入框可用，用户可以回顾提问（"上次运行为什么步骤 3 失败了？"）

### 4.3 权限模型：只读顾问模式

Pipeline Agent 定位为**只读顾问**，不是完整 Agent：

- **可以做**：查询系统状态、读取日志、分析输出、检索知识库、提供建议
- **不能做**：执行 shell 命令、修改文件、重启服务、管理 Docker 容器
- **工具集**：复用现有 `steps/agent.py` 的 `SAFE_TOOLS` 白名单 (27 个只读工具) + 2 个 pipeline 专属工具

这避免了用户在运行面板中发一句话就绕过 Pipeline 的审批语义。危险操作必须通过 Pipeline 步骤本身执行，不能通过侧聊绕过。

### 4.4 并发模型：双 Thread

AI 步骤执行和用户侧聊是**两个独立的 LangGraph thread**，共享运行上下文但不共享消息历史：

```
Pipeline Run #abc
├── Execution Thread: pipeline-exec-{run_id}
│   └── 步骤依次执行，AI 步骤在此 thread 中运行
│       消息历史 = [system prompt + step prompt + AI response]
│
└── Operator Chat Thread: pipeline-chat-{run_id}
    └── 用户随时提问，AI 基于运行上下文回答
        消息历史 = [system prompt + user questions + AI answers]
        上下文注入 = 当前步骤状态 + 前序步骤输出摘要（只读快照）
```

**为什么分离**：
- 执行 thread 的消息是步骤 prompt，有严格的工具调用序列，不应被用户消息打断
- 用户侧聊可能随时发生，如果共享 thread 会破坏步骤执行的确定性
- 分离后两者可以并发：步骤继续执行，用户同时提问

**上下文同步机制**：
- 操作员 chat thread 的系统提示词中注入当前运行快照（步骤状态 + 输出摘要）
- 每次用户发消息时，后端重新构建快照注入，确保 AI 看到最新状态
- 不需要实时同步——快照在用户发消息时刷新即可

### 4.5 单一事件总线：统一 SSE 通道

**所有事件统一走 `/api/pipelines/runs/{id}/stream`**。`POST /runs/{id}/chat` 只负责启动后台 Agent 任务，不直接返回 SSE。

```
                   单一 SSE 通道
              /api/pipelines/runs/{id}/stream
                         │
                         ▼
           ┌─── step_start ──→ StepStatusItem
           │
           ├─── step_complete ──→ StepStatusItem
           │
           ├─── agent_start ──→ 展开 AI 对话区域
           │
SSE ───────┼─── agent_message ──→ AI 消息渲染
Events     │
           ├─── agent_tool_call ──→ 工具调用展示
           │
           ├─── agent_tool_result ──→ 工具结果展示
           │
           ├─── agent_complete ──→ 收起 AI 区域
           │
           ├─── chat_message ──→ 侧聊消息（用户提问的 AI 回复）
           │
           ├─── decision_request ──→ 决策卡片 (P3-B)
           │
           └─── pipeline_complete ──→ 结束状态

用户输入:
  POST /api/pipelines/runs/{id}/chat  → 启动后台 Agent task
                                        → Agent 产出事件 publish 到同一 StreamBridge
                                        → 前端通过同一 /stream 收到
```

**好处**：
- 前端只维护一条 SSE 连接，不存在双通道排序/去重问题
- 断线重连只需重连一条流
- 所有事件天然有序（StreamBridge queue 保证 FIFO）

### 4.6 SSE 事件协议

每个事件都带有标准字段用于排序、去重和历史回放：

```typescript
interface PipelineSSEEvent {
  event_id: string         // UUID，全局唯一
  seq: number              // 递增序列号（per run），断线重连用
  timestamp: string        // ISO 8601
  type: string             // 事件类型
  step_id?: string         // 关联的步骤 ID
  // ... type-specific fields
}
```

| 事件类型 | 数据字段 | 来源 |
|---------|---------|------|
| `step_start` | `step_id, step_name, step_type` | **现有**（扩展 event_id/seq） |
| `step_complete` | `step_id, status, duration_ms, output_preview` | **现有** |
| `step_failed` | `step_id, error` | **现有** |
| `agent_start` | `step_id, step_name` | **新增** — AI 步骤开始 |
| `agent_message` | `step_id, message_id, content, role, final` | **新增** — AI 消息（增量/完整） |
| `agent_tool_call` | `step_id, message_id, tool_call_id, tool, args` | **新增** — AI 调用工具 |
| `agent_tool_result` | `step_id, tool_call_id, tool, result` | **新增** — 工具返回 |
| `agent_complete` | `step_id, summary` | **新增** — AI 步骤完成 |
| `chat_message` | `message_id, content, role, final` | **新增** — 侧聊消息 |
| `chat_tool_call` | `message_id, tool_call_id, tool, args` | **新增** — 侧聊工具调用 |
| `chat_tool_result` | `tool_call_id, tool, result` | **新增** — 侧聊工具结果 |
| `decision_request` | `step_id, prompt, options[]` | **P3-B 预留** |
| `pipeline_complete` | `status, total_duration, summary` | **现有** |

### 4.7 数据存储

#### 4.7.1 复用现有字段

`pipeline_runs.langgraph_thread_id`（已存在于 `database.py:940`）用于执行 thread。

新增一个字段用于侧聊 thread：

```sql
-- database.py init_tables() 中添加
_ensure_column(db, "pipeline_runs", "chat_thread_id", "TEXT DEFAULT NULL")
-- 操作员侧聊的 LangGraph checkpoint thread ID
```

#### 4.7.2 新增 append-only 事件表

**不在 pipeline_runs 上堆 JSON 字段**。新建独立表用于消息存储、回放和分页：

```sql
CREATE TABLE IF NOT EXISTS pipeline_chat_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,           -- UUID
    seq INTEGER NOT NULL,                     -- 递增序号
    event_type TEXT NOT NULL,                 -- agent_message / chat_message / agent_tool_call 等
    step_id TEXT,                             -- 关联步骤（agent 事件有，chat 事件无）
    message_id TEXT,                          -- 消息 ID（同一条 AI 回复的增量帧共享）
    tool_call_id TEXT,                        -- 工具调用 ID
    role TEXT,                                -- user / assistant / tool
    content TEXT,                             -- 消息内容或工具结果
    metadata_json TEXT DEFAULT '{}',          -- 附加数据（tool args, options 等）
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
);
CREATE INDEX IF NOT EXISTS idx_pce_run_seq ON pipeline_chat_events(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_pce_run_type ON pipeline_chat_events(run_id, event_type);
```

**好处**：
- Append-only，写入快
- 支持分页查询（`WHERE run_id = ? ORDER BY seq LIMIT ? OFFSET ?`）
- 支持断线重连（`WHERE run_id = ? AND seq > ?`）
- 支持按类型过滤（只看 agent 事件、只看 chat 事件）
- 不污染 pipeline_runs 表

#### 4.7.3 历史回放 API

新增端点用于首次打开面板时加载历史：

```
GET /api/pipelines/runs/{run_id}/chat-events?after_seq=0&limit=100
```

返回 `pipeline_chat_events` 中该 run 的事件列表。前端先拉历史渲染，再接 SSE 实时流，用 `seq` 去重。

### 4.8 后端实现

#### 4.8.1 PipelineAgent 构建

新文件：`modules/pipelines/pipeline_agent.py`

**关键决策**：不调用 `build_agent()` 缓存层（签名不匹配且有缓存副作用），而是直接使用 `create_deep_agent()` 底层 API 构建专用 Agent。

```python
"""Pipeline 专属 AI Agent — 独立于主 Agent 系统

直接使用 create_deep_agent() 底层 API，不走 build_agent() 缓存层。
原因：
1. build_agent() 签名是 (safety_mode, purpose, user_role, user)，
   不支持自定义 prompt / tool subset / thread_id
2. build_agent() 有全局缓存，Pipeline Agent 需要 per-run 实例
3. 现有 steps/agent.py:50 调用 build_agent(mode=mode) 参数名错误（技术债），
   本模块正面处理此问题
"""

from deepagents import create_deep_agent
from modules.agents.llm import get_chat_model
from modules.agents.sandbox import SafeLocalShellBackend

# 复用现有 SAFE_TOOLS 白名单（与 steps/agent.py 一致）
from modules.pipelines.steps.agent import SAFE_TOOLS


PIPELINE_SYSTEM_PROMPT = """你是 ServerHub Pipeline 执行助手。

## 当前任务
Pipeline: {pipeline_name}
运行 ID: {run_id}
{task_description}

## 你的角色

你是这条流水线的 AI 只读顾问。你的职责：
1. 在 AI 审查节点执行分析任务（安全审计、健康检查等）
2. 回答运维人员关于当前流水线的任何问题
3. 基于步骤输出提供专业建议

## 当前执行状态

{step_context}

## 行为准则

- 你只有只读查询权限，不能执行写入操作（不能重启服务、修改文件、管理容器）
- 危险操作必须通过 Pipeline 步骤本身执行，你不能代替
- 回答要简洁专业，优先给结论
- 分析结果用结构化格式呈现（表格、列表）
"""


async def create_pipeline_agent(
    run_id: str,
    pipeline_context: dict,
    thread_id: str,
    purpose: str = "chat",
):
    """创建 Pipeline 专属 Agent 实例

    直接调用 create_deep_agent()，注入 Pipeline 特有配置。
    不使用 build_agent() 缓存层。

    Args:
        run_id: 运行实例 ID
        pipeline_context: dict with pipeline_name, task_description, step_context
        thread_id: LangGraph checkpoint thread ID
        purpose: "chat" 或 "patrol"（控制模型选择）
    """
    model = get_chat_model(purpose)

    prompt = PIPELINE_SYSTEM_PROMPT.format(
        pipeline_name=pipeline_context.get("pipeline_name", ""),
        run_id=run_id,
        task_description=pipeline_context.get("task_description", ""),
        step_context=pipeline_context.get("step_context", ""),
    )

    # 加载 SAFE_TOOLS 对应的工具对象 + pipeline 专属工具
    tools = _load_pipeline_tools()

    backend = SafeLocalShellBackend(root_dir="~")

    agent = create_deep_agent(
        model=model,
        tools=tools,
        prompt=prompt,
        backend=backend,
        interrupt_on=[],  # 只读模式无需审批
        # 精简中间件：不需要 Filesystem / HumanInTheLoop / Memory
        checkpointer_thread_id=thread_id,
    )

    return agent


def _load_pipeline_tools():
    """加载 SAFE_TOOLS 白名单中的工具 + pipeline 专属工具"""
    from modules.agents.tools.registry import get_registered_tools

    registry = get_registered_tools()
    tools = []
    for name in SAFE_TOOLS:
        meta = registry.get(name)
        if meta:
            tools.append(meta.tool)

    # 添加 pipeline 专属工具
    tools.extend(_get_pipeline_specific_tools())
    return tools


def _get_pipeline_specific_tools():
    """Pipeline 专属工具（新增）"""
    from langchain_core.tools import tool

    @tool
    def get_pipeline_step_output(step_id: str) -> str:
        """获取指定步骤的输出内容"""
        # 实现：从 pipeline_step_logs 查询
        ...

    @tool
    def get_pipeline_run_summary() -> str:
        """获取当前运行的全局概要（所有步骤状态 + 输出摘要）"""
        # 实现：从 pipeline_runs + pipeline_step_logs 聚合
        ...

    return [get_pipeline_step_output, get_pipeline_run_summary]
```

#### 4.8.2 修复现有技术债

`modules/pipelines/steps/agent.py:50` 调用 `build_agent(mode=mode)` 使用了错误的参数名。作为 P3-A 的前置任务修复：

```python
# 修复前（错误）
agent, agent_config = await build_agent(mode=mode)

# 修复后（正确签名）
agent = await build_agent(safety_mode="autonomous", purpose="patrol")
```

注意：`build_agent` 返回的是 agent 本身（通过缓存），不是 `(agent, config)` 元组。`agent_config` 应改为从 agent 属性或默认值构建。

#### 4.8.3 Pipeline chat 端点

在现有 `modules/pipelines/routes.py` 中新增端点（**不创建 routes/ 子目录**，保持现有单文件结构）：

```python
@router.post("/runs/{run_id}/chat")
async def pipeline_run_chat(run_id: str, request: Request, user=Depends(require_role("admin"))):
    """用户在 Pipeline 执行面板中提问 — 启动后台 Agent 任务，事件进 /stream"""
    body = await request.json()
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(400, "消息不能为空")

    # 验证 run 存在
    run = await _get_run(run_id)
    if not run:
        raise HTTPException(404, "运行实例不存在")

    # 构建运行上下文快照
    context = await _build_run_context(run_id)

    # Chat thread ID（复用或创建）
    chat_thread_id = run.get("chat_thread_id") or f"pipeline-chat-{run_id}"
    if not run.get("chat_thread_id"):
        # 持久化 thread ID
        await _update_run_field(run_id, "chat_thread_id", chat_thread_id)

    # 创建 PipelineAgent 并在后台运行
    asyncio.create_task(
        _run_pipeline_chat(run_id, chat_thread_id, context, message)
    )

    return {"ok": True, "message": "已接收，AI 正在思考"}


async def _run_pipeline_chat(run_id, thread_id, context, message):
    """后台运行 PipelineAgent，产出事件 publish 到 StreamBridge"""
    try:
        agent = await create_pipeline_agent(run_id, context, thread_id)

        # 发布用户消息事件
        await _publish_chat_event(run_id, "chat_message", {
            "role": "user", "content": message,
        })

        # 运行 Agent，桥接事件到 Pipeline SSE 通道
        async for event in agent.astream({"messages": [("user", message)]}):
            # 将 Agent 事件转换为 Pipeline SSE 事件
            await _bridge_agent_event_to_pipeline_sse(run_id, event)

    except Exception as e:
        logger.exception("Pipeline chat 执行失败: %s", e)
        await _publish_chat_event(run_id, "chat_message", {
            "role": "assistant", "content": f"抱歉，处理失败: {e}",
            "final": True,
        })
```

#### 4.8.4 历史事件 API

```python
@router.get("/runs/{run_id}/chat-events")
async def get_chat_events(
    run_id: str,
    after_seq: int = 0,
    limit: int = 100,
    user=Depends(require_role("admin")),
):
    """获取 Pipeline 运行的 AI 对话事件历史（支持分页 + 断线续传）"""
    db = await get_db()
    rows = await db.execute_fetchall(
        "SELECT * FROM pipeline_chat_events WHERE run_id = ? AND seq > ? ORDER BY seq LIMIT ?",
        (run_id, after_seq, limit),
    )
    return [dict(r) for r in rows]
```

### 4.9 前端设计

#### 4.9.1 前置任务：抽取纯渲染组件

现有 Agent 组件强绑定 `useChatStore`（Zustand），不能原封不动 import：
- `useProcessedMessages` 第 9/13 行直接调用 `useChatStore()`
- `MessageBubble` 第 18/70/148 行依赖 `streamingMessageId` / `conversationId`

**解决方案**：从现有组件中抽取**无状态纯渲染版本**作为前置任务：

| 现有组件 (有状态) | 抽取为 (无状态) | 改动 |
|-------------------|----------------|------|
| `MessageBubble` | `PureMessageBubble` | 去掉 `useChatStore` 依赖，streaming 状态改为 props 传入 |
| `ToolCallCard` | 无需抽取 | 已经是无状态的 ✓ |
| `MarkdownContent` | 无需抽取 | 已经是无状态的 ✓ |
| `ChatInput` | 无需抽取 | 已经是无状态的 ✓ |
| `useProcessedMessages` | `processMessages()` 纯函数 | 从 hook 中提取 message grouping 逻辑为纯函数 |

抽取后，原有 Agent 页面改为调用纯渲染版本 + 注入 store 状态，保持行为不变。

#### 4.9.2 新增组件

```
src/components/pipeline-run/
├── PipelineRunPanel.tsx          ← 主容器
├── StepStatusItem.tsx            ← 程序化步骤状态行
├── PipelineAgentChat.tsx         ← AI 对话区域（嵌入步骤流）
├── PipelineDecisionCard.tsx      ← 决策选项卡片（P3-B 占位）
└── PipelineChatInput.tsx         ← 输入框（POST /chat + 上下文注入）
```

```
src/hooks/
└── usePipelineRunSSE.ts          ← Pipeline 运行 SSE hook（扩展现有 usePipelineSSE）
```

#### 4.9.3 Hydration 策略

首次打开运行面板时：

```
1. GET /api/pipelines/runs/{run_id}/chat-events?after_seq=0&limit=200
   → 加载历史事件，渲染到面板

2. 连接 SSE /api/pipelines/runs/{run_id}/stream
   → 接收实时事件

3. 收到实时事件时，用 event.seq 去重
   → if (event.seq <= lastRenderedSeq) skip

4. SSE 断线时：
   → 自动重连
   → GET /chat-events?after_seq={lastRenderedSeq}
   → 补充断线期间的事件
   → 重新连接 SSE
```

#### 4.9.4 PipelinesPage 集成

当前右栏直接渲染步骤列表。替换为：

```tsx
{watchRunId && (
  <PipelineRunPanel
    runId={watchRunId}
    run={watchRun}
    stepLogs={runLogs}
  />
)}
```

`PipelineRunPanel` 内部使用 `usePipelineRunSSE(runId)` 管理 SSE 连接和事件状态。

### 4.10 异常场景处理

| 场景 | 处理 |
|------|------|
| 刷新页面 | Hydration 策略：先拉历史事件，再接 SSE |
| SSE 断线 | 自动重连 + 按 seq 补缺 + 去重 |
| Run 已结束后回看 | 不连接 SSE，只拉历史事件渲染 |
| Agent step 执行失败 | 发布 `agent_complete` 事件带 error 字段，面板显示错误信息 |
| 用户提问时 Agent step 正在执行 | 两个独立 thread，互不干扰。侧聊消息带 `chat_` 前缀区分 |
| Pipeline 被取消 | 发布 `pipeline_complete` 事件，chat 仍可用于回顾提问 |

## 5. P3-B 接口预留

P3-A 为以下功能预留接口但不实现：

### 5.1 `decision` 步骤类型
- SSE 事件：`decision_request`（协议表已定义）
- API：`POST /runs/{id}/decide`（routes.py 中声明，返回 501）
- 前端：`PipelineDecisionCard.tsx`（创建占位组件）

### 5.2 AI 主动触发人类介入
- 工具：`request_human_intervention`（在 `_get_pipeline_specific_tools()` 中预留声明）
- 效果：运行时动态发布 `decision_request` 事件

### 5.3 两种介入模式

| 模式 | 触发方式 | 设计时 vs 运行时 |
|------|---------|----------------|
| 固定介入 | 步骤标记 `require_approval: true` | 设计时确定 |
| AI 触发介入 | `request_human_intervention` 工具 | 运行时动态 |

## 6. P3-C 接口预留

### 6.1 AI 辅助工作流设计
- API：`POST /api/pipelines/ai/generate`, `/ai/modify`, `/ai/review`
- P3-A 中仅声明路由，返回 501

### 6.2 模板系统
- 模板 = YAML 文件（现有 TEMPLATES 数组）
- AI 助手在提示词中内置 Pipeline 编排框架知识

## 7. 修改清单总览

### 7.0 前置重构（在 P3-A 实现之前）

| 任务 | 文件 | 改动 |
|------|------|------|
| 修复 build_agent 调用 | `modules/pipelines/steps/agent.py:50` | `mode=` → `safety_mode=` + 修正返回值处理 |
| 抽取 PureMessageBubble | `pages/agents/MessageBubble.tsx` → `components/chat/PureMessageBubble.tsx` | 去 store 依赖，状态改 props |
| 抽取 processMessages | `hooks/useProcessedMessages.ts` → `lib/processMessages.ts` | 提取纯函数 |

### 7.1 后端新增

| 文件 | 职责 |
|------|------|
| `modules/pipelines/pipeline_agent.py` | PipelineAgent：独立提示词 + SAFE_TOOLS + 上下文注入 |
| `modules/pipelines/tools/pipeline_tools.py` | 2 个 pipeline 专属工具 |

### 7.2 后端修改

| 文件 | 改动 |
|------|------|
| `modules/pipelines/routes.py` | 新增 `/runs/{id}/chat` + `/runs/{id}/chat-events` + P3-B/C 占位 |
| `modules/pipelines/executor.py` | Agent 步骤桥接 SSE 事件到 Pipeline 通道 |
| `database.py` | `_ensure_column` chat_thread_id + 新建 pipeline_chat_events 表 |

### 7.3 前端新增

| 文件 | 职责 |
|------|------|
| `components/pipeline-run/PipelineRunPanel.tsx` | 主容器 |
| `components/pipeline-run/StepStatusItem.tsx` | 步骤状态行 |
| `components/pipeline-run/PipelineAgentChat.tsx` | AI 对话区域 |
| `components/pipeline-run/PipelineDecisionCard.tsx` | 决策卡片 (P3-B 占位) |
| `components/pipeline-run/PipelineChatInput.tsx` | 输入框 |
| `hooks/usePipelineRunSSE.ts` | SSE 事件处理 + hydration |

### 7.4 前端修改

| 文件 | 改动 |
|------|------|
| `pages/PipelinesPage.tsx` | 右栏替换为 PipelineRunPanel |

## 8. 不做的事（YAGNI）

- P3-A 不实现 `decision` 步骤类型（P3-B）
- P3-A 不实现 `request_human_intervention` 工具（P3-B）
- P3-A 不实现 AI 辅助工作流设计（P3-C）
- 不做跨运行 AI 记忆
- 不做 Pipeline Agent 自定义配置界面
- 不做移动端适配

## 9. 成功标准

1. Pipeline 运行时，右栏显示混合面板：程序化步骤状态 + AI 节点对话
2. AI 步骤执行时，消息通过统一 SSE 通道实时流式渲染
3. 用户可在底部输入框随时提问，AI 基于 Pipeline 上下文回答（只读查询）
4. Pipeline Agent 使用 SAFE_TOOLS 只读白名单，不能执行写入操作
5. 执行 thread 和侧聊 thread 互不干扰
6. 对话事件存储在 pipeline_chat_events 表，支持分页查询和断线续传
7. 刷新页面后可完整回看运行历史和 AI 对话
8. AI 步骤失败、Pipeline 取消等异常场景有正确的 UI 表现
9. 不影响主 Agent 系统的稳定性
10. React Flow 画布与右栏面板状态联动
