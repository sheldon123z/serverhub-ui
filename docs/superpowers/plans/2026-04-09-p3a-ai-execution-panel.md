# P3-A: AI 执行面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipeline 运行时右栏升级为混合执行面板：程序化步骤状态 + AI 节点实时对话 + 操作员随时提问（只读顾问）

**Architecture:** 共享基础设施（StreamBridge SSE、LLM 注册表、create_deep_agent()），独立业务层（PipelineAgent 专属提示词 + SAFE_TOOLS 白名单 + pipeline_chat_events 表 + 双 Thread 模型）。所有事件统一走 `/api/pipelines/runs/{id}/stream` 单一 SSE 通道。

**Tech Stack:** FastAPI + aiosqlite + deepagents(LangGraph) | React 19 + TypeScript + Tailwind CSS + Vite

**Spec:** `serverhub-ui/docs/superpowers/specs/2026-04-09-pipeline-ai-execution-panel-design.md`

---

## File Map

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `server-hub/modules/pipelines/pipeline_agent.py` | PipelineAgent 工厂：独立提示词 + SAFE_TOOLS + 精简 middleware |
| `server-hub/modules/pipelines/tools/pipeline_tools.py` | 2 个 pipeline 专属工具 |
| `server-hub/modules/pipelines/tools/__init__.py` | 包初始化 |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `server-hub/database.py:979` | `_ensure_column` chat_thread_id + 新建 pipeline_chat_events 表 |
| `server-hub/modules/pipelines/steps/agent.py:50` | 修复 build_agent 调用签名 + 返回值 |
| `server-hub/modules/pipelines/executor.py:174` | 添加 get_run_event_queue 别名 + seq 计数器 + publish_chat_event 辅助函数 |
| `server-hub/modules/pipelines/routes.py:466+` | 新增 /chat + /chat-events + P3-B/C 占位端点 |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `serverhub-ui/src/components/chat/PureMessageBubble.tsx` | 无状态消息气泡（从 MessageBubble 抽取） |
| `serverhub-ui/src/lib/processMessages.ts` | 纯函数版消息分组（从 hook 抽取） |
| `serverhub-ui/src/components/pipeline-run/PipelineRunPanel.tsx` | 混合执行面板主容器 |
| `serverhub-ui/src/components/pipeline-run/StepStatusItem.tsx` | 步骤状态行 |
| `serverhub-ui/src/components/pipeline-run/PipelineAgentChat.tsx` | AI 对话区域 |
| `serverhub-ui/src/components/pipeline-run/PipelineDecisionCard.tsx` | P3-B 决策卡片占位 |
| `serverhub-ui/src/components/pipeline-run/PipelineChatInput.tsx` | 底部输入框 |
| `serverhub-ui/src/hooks/usePipelineRunSSE.ts` | Pipeline 运行 SSE + hydration |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `serverhub-ui/src/pages/agents/MessageBubble.tsx` | 改为使用 PureMessageBubble 的薄包装 |
| `serverhub-ui/src/hooks/useProcessedMessages.ts` | 改为调用纯函数 |
| `serverhub-ui/src/api/pipelines.ts` | 新增 chat 相关类型 + API 方法 |
| `serverhub-ui/src/pages/PipelinesPage.tsx:857-889` | 右栏替换为 PipelineRunPanel |

---

## Task 1: Database Schema Changes

**Files:**
- Modify: `server-hub/database.py` (after line 979, in `init_tables`)

**Depends on:** nothing

- [ ] **Step 1: Add chat_thread_id column to pipeline_runs**

在 `database.py` 的 `init_tables()` 函数中，在 `await _create_pipeline_tables(db)` 调用之后、函数末尾之前，添加：

```python
    # P3-A: Pipeline AI 执行面板扩展
    await _ensure_column(db, "pipeline_runs", "chat_thread_id", "TEXT DEFAULT NULL")
```

找到 `init_tables` 函数（line 966），在最后一行 `await _create_pipeline_tables(db)` 之后添加上述代码。

- [ ] **Step 2: Create pipeline_chat_events table**

在 `_create_pipeline_tables` 函数（定义在 line ~910 附近）的 `executescript` 末尾 `""")`之前，追加新表定义：

在 `database.py` 中找到 `_create_pipeline_tables` 函数里 `pipeline_step_logs` 索引之后、`""")` 之前，追加：

```sql

        CREATE TABLE IF NOT EXISTS pipeline_chat_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            event_id TEXT NOT NULL UNIQUE,
            seq INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            step_id TEXT,
            message_id TEXT,
            tool_call_id TEXT,
            role TEXT,
            content TEXT,
            metadata_json TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (run_id) REFERENCES pipeline_runs(id)
        );
        CREATE INDEX IF NOT EXISTS idx_pce_run_seq ON pipeline_chat_events(run_id, seq);
        CREATE INDEX IF NOT EXISTS idx_pce_run_type ON pipeline_chat_events(run_id, event_type);
```

- [ ] **Step 3: Verify — 启动后端确认表创建成功**

```bash
cd ~/exps/serverhub/server-hub && conda activate serverhub
python -c "
import asyncio, aiosqlite
async def check():
    db = await aiosqlite.connect('data/server-hub.db')
    # Check chat_thread_id column
    cursor = await db.execute('PRAGMA table_info(pipeline_runs)')
    cols = [r[1] for r in await cursor.fetchall()]
    assert 'chat_thread_id' in cols, f'Missing chat_thread_id, cols={cols}'
    # Check pipeline_chat_events table
    cursor = await db.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_chat_events'\")
    assert await cursor.fetchone(), 'pipeline_chat_events table missing'
    await db.close()
    print('OK: schema verified')
asyncio.run(check())
"
```

Expected: `OK: schema verified`

- [ ] **Step 4: Commit**

```bash
cd ~/exps/serverhub/server-hub
git add database.py
git commit -m "feat(pipelines): add chat_thread_id column and pipeline_chat_events table for P3-A"
```

---

## Task 2: Fix steps/agent.py Tech Debt

**Files:**
- Modify: `server-hub/modules/pipelines/steps/agent.py:49-68`

**Depends on:** nothing

- [ ] **Step 1: Fix build_agent call signature and return value**

Replace lines 49-68 of `modules/pipelines/steps/agent.py`:

```python
        # OLD (broken):
        # agent, agent_config = await build_agent(mode=mode)

        # NEW (correct signature):
        agent = await build_agent(
            safety_mode="autonomous",  # Pipeline 步骤始终自主执行
            purpose="patrol",          # 用 patrol 模型节省成本
        )

        # 如果指定了工具白名单，过滤非安全工具
        if allowed_tools:
            unsafe = set(allowed_tools) - SAFE_TOOLS
            if unsafe:
                logger.warning("Agent step 请求了不安全的工具: %s，已过滤", unsafe)
                allowed_tools = [t for t in allowed_tools if t in SAFE_TOOLS]

        run_id = state.get("run_id", "pipeline")
        step_id = config.get("id", "agent")
        thread_id = f"pipeline-{run_id}-{step_id}"

        invoke_config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": max_tool_calls + 5,
        }
```

关键变更：
1. `build_agent(mode=mode)` → `build_agent(safety_mode="autonomous", purpose="patrol")`
2. 不再解构为元组 `(agent, agent_config)`，因为 `build_agent` 返回单个 `agent`
3. `invoke_config` 不再展开 `**agent_config`（不存在）

- [ ] **Step 2: Verify — ruff check**

```bash
cd ~/exps/serverhub/server-hub
ruff check modules/pipelines/steps/agent.py
ruff format modules/pipelines/steps/agent.py
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd ~/exps/serverhub/server-hub
git add modules/pipelines/steps/agent.py
git commit -m "fix(pipelines): correct build_agent() call signature in agent step executor"
```

---

## Task 3: Executor SSE Infrastructure

**Files:**
- Modify: `server-hub/modules/pipelines/executor.py`

**Depends on:** Task 1

- [ ] **Step 1: Add get_run_event_queue alias + seq tracking**

在 `executor.py` 中 `unsubscribe_sse` 函数（line 183）之后，`_publish_sse` 函数（line 190）之前，添加：

```python
# routes.py 调用的公开别名
get_run_event_queue = subscribe_sse

# Per-run 事件序列号计数器
_run_seq_counters: dict[str, int] = {}


def _next_seq(run_id: str) -> int:
    """获取 run 的下一个递增序列号"""
    seq = _run_seq_counters.get(run_id, 0) + 1
    _run_seq_counters[run_id] = seq
    return seq
```

- [ ] **Step 2: Extend _publish_sse with event_id and seq**

修改现有的 `_publish_sse` 函数（line 190），给每个事件添加 `event_id` 和 `seq` 字段：

```python
async def _publish_sse(run_id: str, event_type: str, data: dict):
    """向所有订阅者发布 SSE 事件（含 event_id + seq 用于去重/回放）"""
    import uuid

    subscribers = _sse_subscribers.get(run_id, [])
    event = {
        "type": event_type,
        "event_id": str(uuid.uuid4()),
        "seq": _next_seq(run_id),
        "timestamp": time.time(),
        **data,
    }
    for queue in subscribers:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("SSE 队列已满，丢弃事件: %s", event_type)
```

- [ ] **Step 3: Add publish_chat_event helper for persisting + broadcasting**

在 `_publish_sse` 函数之后添加新的辅助函数：

```python
async def publish_chat_event(
    run_id: str,
    event_type: str,
    data: dict,
    *,
    step_id: str | None = None,
    message_id: str | None = None,
    tool_call_id: str | None = None,
    role: str | None = None,
    content: str | None = None,
):
    """发布聊天事件：同时写入 pipeline_chat_events 表 + 广播 SSE"""
    import uuid

    event_id = str(uuid.uuid4())
    seq = _next_seq(run_id)

    # 持久化到数据库
    try:
        db = await get_db()
        await db.execute(
            """INSERT INTO pipeline_chat_events
               (run_id, event_id, seq, event_type, step_id, message_id, tool_call_id, role, content, metadata_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                run_id, event_id, seq, event_type, step_id,
                message_id, tool_call_id, role, content,
                json.dumps({k: v for k, v in data.items()
                            if k not in ("role", "content")}, ensure_ascii=False, default=str),
            ),
        )
        await db.commit()
    except Exception:
        logger.exception("持久化 chat event 失败: %s", event_type)

    # 广播 SSE（不再走 _publish_sse 以避免 seq 重复）
    subscribers = _sse_subscribers.get(run_id, [])
    event = {
        "type": event_type,
        "event_id": event_id,
        "seq": seq,
        "timestamp": time.time(),
        "step_id": step_id,
        "message_id": message_id,
        "tool_call_id": tool_call_id,
        "role": role,
        "content": content,
        **{k: v for k, v in data.items() if k not in ("role", "content")},
    }
    for queue in subscribers:
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("SSE 队列已满，丢弃 chat event: %s", event_type)
```

- [ ] **Step 4: Clean up seq counters when run completes**

在 `_execute_pipeline` 函数的完成/取消/失败路径中（line ~446, ~454, ~465 附近），清理 seq 计数器。在每个 `_publish_sse(run_id, "pipeline_complete", ...)` 或状态变更之后添加：

```python
        _run_seq_counters.pop(run_id, None)
```

具体位置（三处）：
1. line ~446 `logger.info("Pipeline 运行完成...")` 之后
2. line ~454 `await db.commit()` 之后（CancelledError 分支）
3. line ~465 `await db.commit()` 之后（Exception 分支）

同时，在 `_active_runs` 的清理逻辑中也清理：确认 `_active_runs.pop(run_id, None)` 附近也清理 seq。

- [ ] **Step 5: Verify + Commit**

```bash
cd ~/exps/serverhub/server-hub
ruff check modules/pipelines/executor.py
ruff format modules/pipelines/executor.py
git add modules/pipelines/executor.py
git commit -m "feat(pipelines): add SSE event seq/id tracking and publish_chat_event helper"
```

---

## Task 4: Pipeline-Specific Tools

**Files:**
- Create: `server-hub/modules/pipelines/tools/__init__.py`
- Create: `server-hub/modules/pipelines/tools/pipeline_tools.py`

**Depends on:** Task 1

- [ ] **Step 1: Create tools package**

```bash
mkdir -p ~/exps/serverhub/server-hub/modules/pipelines/tools
```

Create `server-hub/modules/pipelines/tools/__init__.py`:

```python
"""Pipeline 专属工具"""
```

- [ ] **Step 2: Create pipeline_tools.py with 2 tools**

Create `server-hub/modules/pipelines/tools/pipeline_tools.py`:

```python
"""Pipeline 专属工具 — 只在 PipelineAgent 上下文中可用

提供步骤输出查询和运行概要能力，让 AI 能感知当前 Pipeline 执行状态。
"""

import json
import logging

from langchain_core.tools import tool

from database import get_db

logger = logging.getLogger(__name__)


@tool
async def get_pipeline_step_output(step_id: str) -> str:
    """获取指定步骤的执行输出内容。

    Args:
        step_id: 步骤 ID（如 "check-connectivity", "install-docker"）

    Returns:
        步骤输出的 JSON 字符串，包含 status/output/error/duration_ms
    """
    db = await get_db()
    row = await db.execute_fetchone(
        "SELECT step_id, step_type, status, output_json, error, duration_ms "
        "FROM pipeline_step_logs WHERE step_id = ? ORDER BY started_at DESC LIMIT 1",
        (step_id,),
    )
    if not row:
        return json.dumps({"error": f"未找到步骤 {step_id} 的执行记录"}, ensure_ascii=False)

    result = dict(row)
    # 解析 output_json
    if result.get("output_json"):
        try:
            result["output"] = json.loads(result["output_json"])
        except (json.JSONDecodeError, TypeError):
            result["output"] = result["output_json"]
    result.pop("output_json", None)
    return json.dumps(result, ensure_ascii=False, default=str)


@tool
async def get_pipeline_run_summary(run_id: str) -> str:
    """获取当前运行的全局概要：所有步骤状态 + 输出摘要。

    Args:
        run_id: 运行实例 ID

    Returns:
        运行概要的 JSON 字符串
    """
    db = await get_db()

    # 运行基本信息
    run_row = await db.execute_fetchone(
        "SELECT id, pipeline_id, status, current_step_id, error, started_at, completed_at "
        "FROM pipeline_runs WHERE id = ?",
        (run_id,),
    )
    if not run_row:
        return json.dumps({"error": f"未找到运行 {run_id}"}, ensure_ascii=False)

    run_info = dict(run_row)

    # 所有步骤日志
    rows = await db.execute_fetchall(
        "SELECT step_id, step_type, status, duration_ms, error "
        "FROM pipeline_step_logs WHERE run_id = ? ORDER BY started_at",
        (run_id,),
    )
    steps = []
    for r in rows:
        step = dict(r)
        # 截断 error 以节省 token
        if step.get("error") and len(step["error"]) > 200:
            step["error"] = step["error"][:200] + "..."
        steps.append(step)

    run_info["steps"] = steps
    run_info["total_steps"] = len(steps)
    run_info["completed_steps"] = sum(1 for s in steps if s["status"] == "completed")
    run_info["failed_steps"] = sum(1 for s in steps if s["status"] == "failed")

    return json.dumps(run_info, ensure_ascii=False, default=str)


def get_pipeline_tools() -> list:
    """返回 pipeline 专属工具列表"""
    return [get_pipeline_step_output, get_pipeline_run_summary]
```

- [ ] **Step 3: Verify + Commit**

```bash
cd ~/exps/serverhub/server-hub
ruff check modules/pipelines/tools/
ruff format modules/pipelines/tools/
git add modules/pipelines/tools/
git commit -m "feat(pipelines): add pipeline-specific tools for step output and run summary"
```

---

## Task 5: PipelineAgent Factory

**Files:**
- Create: `server-hub/modules/pipelines/pipeline_agent.py`

**Depends on:** Task 4

- [ ] **Step 1: Create pipeline_agent.py**

Create `server-hub/modules/pipelines/pipeline_agent.py`:

```python
"""Pipeline 专属 AI Agent — 独立于主 Agent 系统

直接使用 create_deep_agent() 底层 API，不走 build_agent() 缓存层。
原因：
1. build_agent() 签名是 (safety_mode, purpose, user_role, user)，
   不支持自定义 prompt / tool subset / middleware
2. build_agent() 有全局缓存，Pipeline Agent 需要 per-run 实例
3. Pipeline Agent 使用精简 middleware（无 Filesystem / HumanInTheLoop / Memory）
"""

import logging
from pathlib import Path

import aiosqlite
from deepagents import create_deep_agent
from langchain.agents.middleware import (
    ContextEditingMiddleware,
    ModelCallLimitMiddleware,
    ModelRetryMiddleware,
    ToolRetryMiddleware,
)
from langchain.agents.middleware.context_editing import ClearToolUsesEdit
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from modules.agents.llm import get_chat_model
from modules.agents.sandbox import SafeLocalShellBackend
from modules.agents.tools.registry import get_registered_tools
from modules.pipelines.steps.agent import SAFE_TOOLS
from modules.pipelines.tools.pipeline_tools import get_pipeline_tools

logger = logging.getLogger(__name__)

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

# 存储活跃的 checkpointer 连接，run 结束时关闭
_active_checkpointers: dict[str, AsyncSqliteSaver] = {}


def _load_safe_tools() -> list:
    """加载 SAFE_TOOLS 白名单中的工具对象"""
    registry = get_registered_tools()
    tools = []
    for name in SAFE_TOOLS:
        meta = registry.get(name)
        if meta:
            tools.append(meta.tool)
        else:
            logger.debug("SAFE_TOOLS 中的工具未注册: %s", name)
    return tools


async def create_pipeline_agent(
    run_id: str,
    pipeline_context: dict,
    thread_id: str,
    purpose: str = "patrol",
):
    """创建 Pipeline 专属 Agent 实例

    直接调用 create_deep_agent()，注入 Pipeline 特有配置。

    Args:
        run_id: 运行实例 ID
        pipeline_context: {pipeline_name, task_description, step_context}
        thread_id: LangGraph checkpoint thread ID
        purpose: "chat" 或 "patrol"（控制模型选择）

    Returns:
        (agent, invoke_config) 元组
    """
    model = get_chat_model(purpose)

    system_prompt = PIPELINE_SYSTEM_PROMPT.format(
        pipeline_name=pipeline_context.get("pipeline_name", ""),
        run_id=run_id,
        task_description=pipeline_context.get("task_description", ""),
        step_context=pipeline_context.get("step_context", "无"),
    )

    # 工具 = SAFE_TOOLS 白名单 + pipeline 专属工具
    tools = _load_safe_tools() + get_pipeline_tools()

    backend = SafeLocalShellBackend(root_dir="~")

    # 精简 middleware：只保留重试 + 调用限制 + 上下文编辑
    middleware = [
        ModelRetryMiddleware(max_retries=3),
        ToolRetryMiddleware(max_retries=2),
        ModelCallLimitMiddleware(max_calls=50),
        ContextEditingMiddleware(
            edit=ClearToolUsesEdit(threshold_tokens=60000, keep_last_n=5),
        ),
    ]

    # Per-run checkpointer
    data_dir = Path("data")
    cp_path = data_dir / "pipeline-checkpoints.db"
    conn = await aiosqlite.connect(str(cp_path))
    checkpointer = AsyncSqliteSaver(conn)
    _active_checkpointers[run_id] = checkpointer

    agent = create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        interrupt_on=None,  # 只读模式无需审批
        checkpointer=checkpointer,
        backend=backend,
        subagents=[],
        middleware=middleware,
        memory=None,
        skills=None,
        store=None,
    )

    invoke_config = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": 25,
    }

    logger.info(
        "PipelineAgent 已创建: run=%s, thread=%s, tools=%d",
        run_id, thread_id, len(tools),
    )
    return agent, invoke_config


async def cleanup_pipeline_agent(run_id: str):
    """清理 Pipeline Agent 资源（run 结束时调用）"""
    cp = _active_checkpointers.pop(run_id, None)
    if cp and hasattr(cp, "conn") and cp.conn:
        try:
            await cp.conn.close()
        except Exception:
            pass
    logger.debug("PipelineAgent 资源已清理: run=%s", run_id)
```

- [ ] **Step 2: Verify + Commit**

```bash
cd ~/exps/serverhub/server-hub
ruff check modules/pipelines/pipeline_agent.py
ruff format modules/pipelines/pipeline_agent.py
git add modules/pipelines/pipeline_agent.py
git commit -m "feat(pipelines): create PipelineAgent factory with read-only advisor mode"
```

---

## Task 6: Backend Chat API Endpoints

**Files:**
- Modify: `server-hub/modules/pipelines/routes.py` (append after line ~466)

**Depends on:** Tasks 1, 3, 5

- [ ] **Step 1: Add imports at top of routes.py**

在 `routes.py` 文件顶部的 import 区域添加：

```python
import uuid
```

（`asyncio` 和 `json` 应该已经 import。）

- [ ] **Step 2: Add _build_run_context helper**

在 routes.py 末尾（最后一个路由函数之后）追加辅助函数：

```python
# ---------------------------------------------------------------------------
# P3-A: Pipeline AI 执行面板
# ---------------------------------------------------------------------------


async def _build_run_context(run_id: str) -> dict:
    """构建 Pipeline 运行上下文快照（注入到 PipelineAgent 提示词）"""
    db = await get_db()

    run = await db.execute_fetchone(
        "SELECT id, pipeline_id, status, current_step_id, error, params_json FROM pipeline_runs WHERE id = ?",
        (run_id,),
    )
    if not run:
        return {}

    # 获取 Pipeline 名称
    pipeline = await db.execute_fetchone(
        "SELECT name, display_name, description FROM pipelines WHERE id = ?",
        (run["pipeline_id"],),
    )

    # 获取已执行步骤的摘要
    rows = await db.execute_fetchall(
        "SELECT step_id, step_type, status, duration_ms, error "
        "FROM pipeline_step_logs WHERE run_id = ? ORDER BY started_at",
        (run_id,),
    )
    step_lines = []
    for r in rows:
        status_icon = {"completed": "✓", "failed": "✗", "running": "▶"}.get(r["status"], "○")
        dur = f" ({r['duration_ms']}ms)" if r["duration_ms"] else ""
        err = f" — {r['error'][:100]}" if r["error"] else ""
        step_lines.append(f"  {status_icon} [{r['step_type']}] {r['step_id']}{dur}{err}")

    step_context = "\n".join(step_lines) if step_lines else "暂无步骤执行记录"

    return {
        "pipeline_name": pipeline["display_name"] if pipeline else run["pipeline_id"],
        "task_description": pipeline["description"] if pipeline else "",
        "step_context": f"当前状态: {run['status']}\n已执行步骤:\n{step_context}",
    }
```

- [ ] **Step 3: Add POST /runs/{id}/chat endpoint**

继续在 routes.py 末尾追加：

```python
@router.post("/runs/{run_id}/chat")
async def api_pipeline_chat(
    run_id: str,
    request: Request,
    user=Depends(require_role("admin")),
):
    """用户在 Pipeline 执行面板中提问 — 启动后台 Agent 任务，事件进 /stream"""
    body = await request.json()
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(400, "消息不能为空")

    db = await get_db()
    run = await db.execute_fetchone(
        "SELECT id, chat_thread_id FROM pipeline_runs WHERE id = ?", (run_id,),
    )
    if not run:
        raise HTTPException(404, "运行实例不存在")

    # Chat thread ID（复用或创建）
    chat_thread_id = run["chat_thread_id"] or f"pipeline-chat-{run_id}"
    if not run["chat_thread_id"]:
        await db.execute(
            "UPDATE pipeline_runs SET chat_thread_id = ? WHERE id = ?",
            (chat_thread_id, run_id),
        )
        await db.commit()

    # 在后台运行 PipelineAgent
    asyncio.ensure_future(_run_pipeline_chat(run_id, chat_thread_id, message))

    return {"ok": True, "message": "已接收，AI 正在思考"}


async def _run_pipeline_chat(run_id: str, thread_id: str, message: str):
    """后台运行 PipelineAgent，产出事件 publish 到 Pipeline SSE 通道"""
    from modules.pipelines.executor import publish_chat_event
    from modules.pipelines.pipeline_agent import (
        cleanup_pipeline_agent,
        create_pipeline_agent,
    )

    msg_id = str(uuid.uuid4())

    try:
        # 发布用户消息事件
        await publish_chat_event(
            run_id, "chat_message",
            {"final": True},
            message_id=msg_id,
            role="user",
            content=message,
        )

        # 构建上下文并创建 Agent
        context = await _build_run_context(run_id)
        agent, invoke_config = await create_pipeline_agent(
            run_id, context, thread_id, purpose="patrol",
        )

        # 流式运行 Agent，桥接事件到 Pipeline SSE 通道
        ai_msg_id = str(uuid.uuid4())
        accumulated_content = ""

        async for event in agent.astream(
            {"messages": [("user", message)]},
            config=invoke_config,
        ):
            # LangGraph astream 产出状态更新 dict
            messages = event.get("messages", [])
            for msg in messages:
                role = getattr(msg, "type", None)  # "ai" / "tool" / "human"

                if role == "ai":
                    content = getattr(msg, "content", "")
                    if isinstance(content, list):
                        content = "".join(
                            item.get("text", "") for item in content if isinstance(item, dict)
                        )

                    # 检查工具调用
                    tool_calls = getattr(msg, "tool_calls", [])
                    for tc in tool_calls:
                        tc_id = str(uuid.uuid4())
                        await publish_chat_event(
                            run_id, "chat_tool_call",
                            {"tool": tc.get("name", ""), "args": tc.get("args", {})},
                            message_id=ai_msg_id,
                            tool_call_id=tc_id,
                        )

                    if content and content != accumulated_content:
                        accumulated_content = content
                        await publish_chat_event(
                            run_id, "chat_message",
                            {"final": False},
                            message_id=ai_msg_id,
                            role="assistant",
                            content=content,
                        )

                elif role == "tool":
                    tool_name = getattr(msg, "name", "")
                    tool_content = getattr(msg, "content", "")
                    await publish_chat_event(
                        run_id, "chat_tool_result",
                        {"tool": tool_name},
                        tool_call_id=getattr(msg, "tool_call_id", None),
                        content=tool_content,
                    )

        # 发送最终消息
        if accumulated_content:
            await publish_chat_event(
                run_id, "chat_message",
                {"final": True},
                message_id=ai_msg_id,
                role="assistant",
                content=accumulated_content,
            )

    except Exception as e:
        logger.exception("Pipeline chat 执行失败: %s", e)
        await publish_chat_event(
            run_id, "chat_message",
            {"final": True},
            message_id=str(uuid.uuid4()),
            role="assistant",
            content=f"抱歉，处理失败: {e}",
        )
    finally:
        await cleanup_pipeline_agent(run_id)
```

- [ ] **Step 4: Add GET /runs/{id}/chat-events endpoint**

继续追加：

```python
@router.get("/runs/{run_id}/chat-events")
async def api_get_chat_events(
    run_id: str,
    after_seq: int = 0,
    limit: int = 100,
    user=Depends(get_current_user),
):
    """获取 Pipeline 运行的 AI 对话事件历史（分页 + 断线续传）"""
    db = await get_db()
    rows = await db.execute_fetchall(
        "SELECT * FROM pipeline_chat_events WHERE run_id = ? AND seq > ? ORDER BY seq LIMIT ?",
        (run_id, after_seq, limit),
    )
    return [dict(r) for r in rows]
```

- [ ] **Step 5: Add P3-B/C placeholder endpoints**

继续追加：

```python
# ---------------------------------------------------------------------------
# P3-B/C 占位端点（返回 501）
# ---------------------------------------------------------------------------

@router.post("/runs/{run_id}/decide")
async def api_pipeline_decide(run_id: str, user=Depends(require_role("admin"))):
    """P3-B: 人类决策响应 — 尚未实现"""
    raise HTTPException(501, "决策功能将在 P3-B 中实现")


@router.post("/ai/generate")
async def api_ai_generate(request: Request, user=Depends(require_role("admin"))):
    """P3-C: AI 生成工作流 — 尚未实现"""
    raise HTTPException(501, "AI 工作流生成将在 P3-C 中实现")


@router.post("/ai/modify")
async def api_ai_modify(request: Request, user=Depends(require_role("admin"))):
    """P3-C: AI 修改工作流 — 尚未实现"""
    raise HTTPException(501, "AI 工作流修改将在 P3-C 中实现")


@router.post("/ai/review")
async def api_ai_review(request: Request, user=Depends(require_role("admin"))):
    """P3-C: AI 审查工作流 — 尚未实现"""
    raise HTTPException(501, "AI 工作流审查将在 P3-C 中实现")
```

- [ ] **Step 6: Verify + Commit**

```bash
cd ~/exps/serverhub/server-hub
ruff check modules/pipelines/routes.py
ruff format modules/pipelines/routes.py
git add modules/pipelines/routes.py
git commit -m "feat(pipelines): add chat, chat-events, and P3-B/C placeholder API endpoints"
```

---

## Task 7: Extract Pure Components (Frontend)

**Files:**
- Create: `serverhub-ui/src/components/chat/PureMessageBubble.tsx`
- Create: `serverhub-ui/src/lib/processMessages.ts`
- Modify: `serverhub-ui/src/pages/agents/MessageBubble.tsx`
- Modify: `serverhub-ui/src/hooks/useProcessedMessages.ts`

**Depends on:** nothing (can parallel with backend tasks)

- [ ] **Step 1: Create PureMessageBubble**

Create `serverhub-ui/src/components/chat/PureMessageBubble.tsx`:

```tsx
/**
 * PureMessageBubble — stateless message renderer (no store dependencies).
 *
 * Extracted from pages/agents/MessageBubble.tsx.
 * The original MessageBubble is now a thin wrapper that injects store state.
 */

import React, { useCallback } from 'react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types/agent'
import { useStreamingText } from '@/hooks/useStreamingText'
import { MarkdownContent } from '@/pages/agents/MarkdownContent'

interface PureMessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  onDelete?: (id: string) => void
  onResend?: (content: string, id: string) => void
}

function ActionBar({
  onCopy,
  onDelete,
  onResend,
}: {
  onCopy: () => void
  onDelete?: () => void
  onResend?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-1',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        'text-xs',
      )}
    >
      <button onClick={onCopy} className="hover:text-accent px-1.5 py-0.5 text-text3" title="复制">
        复制
      </button>
      {onResend && (
        <button onClick={onResend} className="hover:text-accent px-1.5 py-0.5 text-text3" title="重发">
          重发
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} className="hover:text-red px-1.5 py-0.5 text-text3" title="删除">
          删除
        </button>
      )}
    </div>
  )
}

export const PureMessageBubble = React.memo(function PureMessageBubble({
  message,
  isStreaming = false,
  onDelete,
  onResend,
}: PureMessageBubbleProps) {
  const { role, content, _id } = message

  const { displayedContent, isAnimating } = useStreamingText(content, {
    enabled: isStreaming,
    segmentDelay: 12,
  })

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => toast.success('已复制')).catch(() => toast.error('复制失败'))
  }, [content])

  const handleDelete = onDelete ? () => onDelete(_id) : undefined
  const handleResend = onResend ? () => onResend(content, _id) : undefined

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[85%]">
          <div
            className={cn(
              'rounded-xl rounded-br-sm px-4 py-2.5',
              'bg-accent text-[#0f172a]',
              'text-sm leading-relaxed whitespace-pre-wrap break-words',
            )}
          >
            {content}
          </div>
          <div className="flex justify-end">
            <ActionBar onCopy={handleCopy} onDelete={handleDelete} onResend={handleResend} />
          </div>
        </div>
      </div>
    )
  }

  if (role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="group max-w-[85%]">
          <div
            className={cn(
              'rounded-xl rounded-bl-sm px-4 py-2.5',
              'glass',
              'text-sm leading-relaxed',
            )}
          >
            {isStreaming ? (
              <>
                <span className="whitespace-pre-wrap">{displayedContent}</span>
                {isAnimating && (
                  <span className="inline-block w-1.5 h-4 bg-accent/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                )}
              </>
            ) : (
              <MarkdownContent content={content} />
            )}
          </div>
          <ActionBar onCopy={handleCopy} onDelete={handleDelete} onResend={handleResend} />
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] glass rounded-lg px-3 py-2 text-sm text-text2">
        {content}
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Rewrite MessageBubble as thin wrapper**

Replace the entire content of `serverhub-ui/src/pages/agents/MessageBubble.tsx` with:

```tsx
/**
 * MessageBubble — store-aware wrapper around PureMessageBubble.
 *
 * Injects streaming state from useChatStore and handles UI component messages.
 * The pure rendering logic lives in components/chat/PureMessageBubble.tsx.
 */

import React from 'react'
import { cn } from '@/lib/utils'
import type { ChatMessage, UIComponentMessage } from '@/types/agent'
import { isUIComponentMessage } from '@/lib/message-utils'
import { PureMessageBubble } from '@/components/chat/PureMessageBubble'
import { UICard } from '@/components/agent/UICard'
import { UIComponentErrorBoundary } from '@/components/agent/UIComponentErrorBoundary'
import { useChatStore } from '@/stores/chatStore'

interface MessageBubbleProps {
  message: ChatMessage
  onDelete?: (id: string) => void
  onResend?: (content: string, id: string) => void
}

export const MessageBubble = React.memo(function MessageBubble({ message, onDelete, onResend }: MessageBubbleProps) {
  const streamingMessageId = useChatStore((s) => s.streamingMessageId)
  const isStreaming = message.role === 'assistant' && message._id === streamingMessageId

  // UI Component messages — keep store-dependent logic here
  if (message.role === 'ui_component' && isUIComponentMessage(message)) {
    const handleUIAction = (actionId: string, payload?: Record<string, unknown>) => {
      fetch('/api/agents/ui/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          component_id: message.data?.id,
          component_type: message.componentType,
          action_id: actionId,
          action_type: 'agent',
          payload: payload ?? {},
          conversation_id: useChatStore.getState().conversationId,
          run_id: useChatStore.getState().currentRunId,
        }),
      }).catch(console.error)
    }

    return (
      <div className="flex justify-start">
        <div className="group max-w-[95%]">
          <UIComponentErrorBoundary componentId={(message.data?.id as string) ?? 'unknown'}>
            <UICard
              component={message.data as UIComponentMessage['data']}
              onAction={handleUIAction}
            />
          </UIComponentErrorBoundary>
        </div>
      </div>
    )
  }

  // Delegate to pure renderer
  return (
    <PureMessageBubble
      message={message}
      isStreaming={isStreaming}
      onDelete={onDelete}
      onResend={onResend}
    />
  )
})
```

- [ ] **Step 3: Extract processMessages pure function**

Create `serverhub-ui/src/lib/processMessages.ts`:

```ts
/**
 * processMessages — pure function that groups tool calls under assistant messages.
 *
 * Extracted from hooks/useProcessedMessages.ts for reuse in Pipeline chat.
 */

import type { ChatMessage, ProcessedMessage, ToolCallItem, SubAgentItem } from '@/types/agent'

export function processMessages(messages: ChatMessage[]): ProcessedMessage[] {
  const result: ProcessedMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'tool_call') {
      let last = result.length > 0 ? result[result.length - 1] : null
      if (!last || last.message.role !== 'assistant') {
        const syntheticAssistant: ProcessedMessage = {
          message: { _id: `synth-${msg._id}`, role: 'assistant', content: '' },
          toolCalls: [],
          subAgents: [],
        }
        result.push(syntheticAssistant)
        last = syntheticAssistant
      }
      if (last) {
        if (msg.args?.subagent_type) {
          const sa: SubAgentItem = {
            id: msg._id,
            name: (msg.args.subagent_name as string) ?? msg.tool ?? 'subagent',
            subAgentName: (msg.args.subagent_name as string) ?? msg.tool ?? 'SubAgent',
            input: (msg.args as Record<string, unknown>) ?? {},
            output: undefined,
            status: msg.content ? 'completed' : 'pending',
          }
          last.subAgents.push(sa)
        } else {
          const tc: ToolCallItem = {
            id: msg._id,
            name: msg.tool ?? 'unknown',
            args: msg.args ?? {},
            result: msg.content || undefined,
            status: msg.content ? 'completed' : 'pending',
          }
          last.toolCalls.push(tc)
        }
      }
      continue
    }

    if (msg.role === 'tool_result') {
      const last = result.length > 0 ? result[result.length - 1] : null
      if (last && last.message.role === 'assistant') {
        const tc = last.toolCalls.find(
          (t) => t.name === msg.tool && t.status === 'pending',
        )
        if (tc) {
          tc.result = msg.content
          tc.status = msg.content?.startsWith('Error') ? 'error' : 'completed'
        }
        const sa = last.subAgents.find(
          (s) => s.name === msg.tool && s.status === 'pending',
        )
        if (sa) {
          try {
            sa.output = JSON.parse(msg.content) as Record<string, unknown>
          } catch {
            sa.output = { result: msg.content }
          }
          sa.status = msg.content?.startsWith('Error') ? 'error' : 'completed'
        }
      }
      continue
    }

    result.push({
      message: msg,
      toolCalls: [],
      subAgents: [],
    })
  }

  return result
}
```

- [ ] **Step 4: Update useProcessedMessages to use pure function**

Replace the content of `serverhub-ui/src/hooks/useProcessedMessages.ts`:

```ts
/**
 * useProcessedMessages — hook wrapper around processMessages pure function.
 *
 * Core logic extracted to lib/processMessages.ts for reuse.
 */

import { useMemo } from 'react'
import { useChatStore } from '@/stores/chatStore'
import type { ProcessedMessage } from '@/types/agent'
import { processMessages } from '@/lib/processMessages'

export function useProcessedMessages(): ProcessedMessage[] {
  const messages = useChatStore((s) => s.messages)
  return useMemo(() => processMessages(messages), [messages])
}
```

- [ ] **Step 5: Verify — build check**

```bash
cd ~/exps/serverhub/serverhub-ui
npx tsc --noEmit 2>&1 | head -20
```

Expected: no type errors related to MessageBubble or processMessages

- [ ] **Step 6: Commit**

```bash
cd ~/exps/serverhub/serverhub-ui
git add src/components/chat/PureMessageBubble.tsx src/lib/processMessages.ts \
        src/pages/agents/MessageBubble.tsx src/hooks/useProcessedMessages.ts
git commit -m "refactor: extract PureMessageBubble and processMessages for pipeline reuse"
```

---

## Task 8: Frontend API Types & Methods

**Files:**
- Modify: `serverhub-ui/src/api/pipelines.ts`

**Depends on:** nothing

- [ ] **Step 1: Add chat event types and API methods**

在 `serverhub-ui/src/api/pipelines.ts` 文件末尾（`pipelinesApi` 对象的最后一个方法之后、闭合 `}` 之前）添加新方法。

首先，在文件顶部类型区域（`StepLog` interface 之后、`ValidationResult` 之前）添加新类型：

```ts
export interface PipelineChatEvent {
  id: number
  run_id: string
  event_id: string
  seq: number
  event_type: string
  step_id: string | null
  message_id: string | null
  tool_call_id: string | null
  role: string | null
  content: string | null
  metadata_json: string
  created_at: string
}

export type PipelineSSEEventType =
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'step_retry'
  | 'approval_required'
  | 'agent_start'
  | 'agent_message'
  | 'agent_tool_call'
  | 'agent_tool_result'
  | 'agent_complete'
  | 'chat_message'
  | 'chat_tool_call'
  | 'chat_tool_result'
  | 'decision_request'
  | 'pipeline_complete'

export interface PipelineSSEEvent {
  event_id: string
  seq: number
  timestamp: number
  type: PipelineSSEEventType
  step_id?: string
  message_id?: string
  tool_call_id?: string
  role?: string
  content?: string
  final?: boolean
  tool?: string
  args?: Record<string, unknown>
  // step events
  step_name?: string
  step_type?: string
  status?: string
  duration_ms?: number
  error?: string
  // pipeline_complete
  total_duration?: number
  summary?: string
}
```

然后在 `pipelinesApi` 对象的 `getRunLogs` 方法之后添加：

```ts
  // P3-A: Pipeline AI Chat
  sendChatMessage: (runId: string, message: string) =>
    client.post<{ ok: true; message: string }>(`/api/pipelines/runs/${runId}/chat`, { message }),

  getChatEvents: (runId: string, afterSeq = 0, limit = 200) =>
    client.get<PipelineChatEvent[]>(`/api/pipelines/runs/${runId}/chat-events`, {
      params: { after_seq: afterSeq, limit },
    }),
```

- [ ] **Step 2: Commit**

```bash
cd ~/exps/serverhub/serverhub-ui
git add src/api/pipelines.ts
git commit -m "feat(pipelines): add chat event types and API methods for P3-A"
```

---

## Task 9: Pipeline Run SSE Hook

**Files:**
- Create: `serverhub-ui/src/hooks/usePipelineRunSSE.ts`

**Depends on:** Task 8

- [ ] **Step 1: Create usePipelineRunSSE hook**

Create `serverhub-ui/src/hooks/usePipelineRunSSE.ts`:

```ts
/**
 * usePipelineRunSSE — Pipeline 运行 SSE 事件管理 + hydration
 *
 * 处理统一 SSE 通道中的所有事件类型：
 * - 步骤状态事件 (step_start, step_complete, step_failed)
 * - Agent 执行事件 (agent_start, agent_message, agent_tool_call, agent_tool_result, agent_complete)
 * - 侧聊事件 (chat_message, chat_tool_call, chat_tool_result)
 * - 流水线事件 (pipeline_complete, approval_required)
 *
 * Hydration 策略：先拉历史 → 再接 SSE → 用 seq 去重
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineChatEvent, PipelineSSEEvent, StepStatus } from '@/api/pipelines'
import { pipelinesApi } from '@/api/pipelines'

/* ── Types ── */

export interface StepState {
  step_id: string
  step_name?: string
  step_type?: string
  status: StepStatus
  duration_ms?: number
  error?: string
  output_preview?: string
  assignee?: string
}

export interface ChatMessage {
  id: string
  message_id: string
  event_type: string
  role: string
  content: string
  final: boolean
  step_id?: string
  tool?: string
  args?: Record<string, unknown>
  tool_call_id?: string
  seq: number
}

interface PipelineRunSSEState {
  /** 步骤状态 Map (step_id → StepState) */
  stepStates: Map<string, StepState>
  /** 聊天消息列表（agent + chat 合并，按 seq 排序） */
  chatMessages: ChatMessage[]
  /** 当前活跃的 AI 步骤 ID（agent_start 后、agent_complete 前） */
  activeAgentStepId: string | null
  /** SSE 是否已连接 */
  connected: boolean
  /** Pipeline 是否已结束 */
  completed: boolean
  /** 侧聊 AI 是否正在响应 */
  isChatStreaming: boolean
}

/* ── Hook ── */

export function usePipelineRunSSE(runId: string | null) {
  const [state, setState] = useState<PipelineRunSSEState>({
    stepStates: new Map(),
    chatMessages: [],
    activeAgentStepId: null,
    connected: false,
    completed: false,
    isChatStreaming: false,
  })

  const lastSeqRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  // 分发单个 SSE 事件到状态
  const dispatchEvent = useCallback((evt: PipelineSSEEvent) => {
    // seq 去重
    if (evt.seq != null && evt.seq <= lastSeqRef.current) return
    if (evt.seq != null) lastSeqRef.current = evt.seq

    setState((prev) => {
      const next = { ...prev }
      const type = evt.type

      // ── 步骤状态事件 ──
      if (type === 'step_start' || type === 'step_complete' || type === 'step_failed' || type === 'step_retry' || type === 'approval_required') {
        if (evt.step_id) {
          const steps = new Map(prev.stepStates)
          const existing = steps.get(evt.step_id) ?? { step_id: evt.step_id, status: 'pending' as StepStatus }
          steps.set(evt.step_id, {
            ...existing,
            ...evt,
            status: (evt.status as StepStatus) ??
              (type === 'step_start' ? 'running' : type === 'step_complete' ? 'completed' : type === 'step_failed' ? 'failed' : existing.status),
          })
          next.stepStates = steps
        }
        return next
      }

      // ── Agent 执行事件 ──
      if (type === 'agent_start') {
        next.activeAgentStepId = evt.step_id ?? null
        return next
      }
      if (type === 'agent_complete') {
        next.activeAgentStepId = null
        return next
      }

      // ── 消息事件（agent + chat 统一处理）──
      if (type === 'agent_message' || type === 'chat_message' ||
          type === 'agent_tool_call' || type === 'chat_tool_call' ||
          type === 'agent_tool_result' || type === 'chat_tool_result') {
        const messages = [...prev.chatMessages]
        const msgId = evt.message_id ?? evt.tool_call_id ?? evt.event_id

        // 对于增量消息（final=false），更新已有消息而非追加
        if ((type === 'agent_message' || type === 'chat_message') && !evt.final) {
          const existingIdx = messages.findIndex((m) => m.message_id === evt.message_id && m.role === (evt.role ?? 'assistant'))
          if (existingIdx >= 0) {
            messages[existingIdx] = { ...messages[existingIdx], content: evt.content ?? '', seq: evt.seq }
            next.chatMessages = messages
            if (type === 'chat_message') next.isChatStreaming = true
            return next
          }
        }

        // 追加新消息
        messages.push({
          id: evt.event_id,
          message_id: evt.message_id ?? msgId,
          event_type: type,
          role: evt.role ?? (type.includes('tool_call') ? 'tool_call' : type.includes('tool_result') ? 'tool_result' : 'assistant'),
          content: evt.content ?? '',
          final: evt.final ?? true,
          step_id: evt.step_id,
          tool: evt.tool,
          args: evt.args,
          tool_call_id: evt.tool_call_id,
          seq: evt.seq,
        })
        next.chatMessages = messages

        // streaming 状态
        if (type === 'chat_message') {
          next.isChatStreaming = !evt.final
        }
        return next
      }

      // ── Pipeline 完成 ──
      if (type === 'pipeline_complete') {
        next.completed = true
        next.connected = false
        return next
      }

      return next
    })
  }, [])

  // 从历史事件恢复状态
  const hydrateFromHistory = useCallback(async (rid: string) => {
    try {
      const res = await pipelinesApi.getChatEvents(rid, 0, 500)
      const events = res.data
      if (!events?.length) return

      for (const evt of events) {
        const parsed: PipelineSSEEvent = {
          event_id: evt.event_id,
          seq: evt.seq,
          timestamp: 0,
          type: evt.event_type as PipelineSSEEvent['type'],
          step_id: evt.step_id ?? undefined,
          message_id: evt.message_id ?? undefined,
          tool_call_id: evt.tool_call_id ?? undefined,
          role: evt.role ?? undefined,
          content: evt.content ?? undefined,
          ...(evt.metadata_json ? JSON.parse(evt.metadata_json) : {}),
        }
        dispatchEvent(parsed)
      }
    } catch {
      // hydration 失败不影响实时流
    }
  }, [dispatchEvent])

  // SSE 连接
  useEffect(() => {
    if (!runId) {
      setState({
        stepStates: new Map(),
        chatMessages: [],
        activeAgentStepId: null,
        connected: false,
        completed: false,
        isChatStreaming: false,
      })
      lastSeqRef.current = 0
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller

    const run = async () => {
      // 1. Hydrate from history
      await hydrateFromHistory(runId)

      // 2. Connect SSE
      try {
        const response = await fetch(`/api/pipelines/runs/${runId}/stream`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok || !response.body) return

        setState((s) => ({ ...s, connected: true }))
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) {
              currentEvent = ''
              continue
            }
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim()
              continue
            }
            if (!trimmed.startsWith('data:')) continue

            const dataStr = trimmed.slice(5).trim()
            if (!dataStr) continue
            try {
              const data = JSON.parse(dataStr) as PipelineSSEEvent
              // 用 currentEvent 覆盖 type（SSE event 字段优先）
              if (currentEvent) data.type = currentEvent as PipelineSSEEvent['type']
              dispatchEvent(data)
            } catch {
              // ignore invalid JSON
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      } finally {
        setState((s) => ({ ...s, connected: false }))
      }
    }

    run()

    return () => {
      controller.abort()
      controllerRef.current = null
    }
  }, [runId, hydrateFromHistory, dispatchEvent])

  // 发送聊天消息
  const sendMessage = useCallback(
    async (message: string) => {
      if (!runId || !message.trim()) return
      setState((s) => ({ ...s, isChatStreaming: true }))
      try {
        await pipelinesApi.sendChatMessage(runId, message.trim())
      } catch {
        setState((s) => ({ ...s, isChatStreaming: false }))
      }
    },
    [runId],
  )

  return {
    ...state,
    sendMessage,
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd ~/exps/serverhub/serverhub-ui
npx tsc --noEmit src/hooks/usePipelineRunSSE.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd ~/exps/serverhub/serverhub-ui
git add src/hooks/usePipelineRunSSE.ts
git commit -m "feat(pipelines): add usePipelineRunSSE hook with hydration and seq dedup"
```

---

## Task 10: Pipeline Run Components

**Files:**
- Create: `serverhub-ui/src/components/pipeline-run/StepStatusItem.tsx`
- Create: `serverhub-ui/src/components/pipeline-run/PipelineAgentChat.tsx`
- Create: `serverhub-ui/src/components/pipeline-run/PipelineDecisionCard.tsx`
- Create: `serverhub-ui/src/components/pipeline-run/PipelineChatInput.tsx`
- Create: `serverhub-ui/src/components/pipeline-run/PipelineRunPanel.tsx`

**Depends on:** Tasks 7, 8, 9

- [ ] **Step 1: Create StepStatusItem**

Create `serverhub-ui/src/components/pipeline-run/StepStatusItem.tsx`:

```tsx
/**
 * StepStatusItem — 单个步骤的状态行。
 * Agent 类型步骤在 running 状态时展开 AI 对话区域。
 */

import { cn } from '@/lib/utils'
import type { StepStatus } from '@/api/pipelines'
import type { StepState, ChatMessage } from '@/hooks/usePipelineRunSSE'
import { PipelineAgentChat } from './PipelineAgentChat'

const STEP_TYPE_ICON: Record<string, string> = {
  shell: 'ti-terminal-2',
  ssh: 'ti-server',
  agent: 'ti-robot',
  approval: 'ti-user-check',
  condition: 'ti-git-branch',
  parallel: 'ti-arrows-split-2',
  notify: 'ti-bell',
  http: 'ti-world',
  delay: 'ti-clock',
  playbook: 'ti-book',
}

const STATUS_ICON: Record<string, string> = {
  pending: 'ti-circle',
  running: 'ti-loader animate-spin',
  completed: 'ti-circle-check',
  failed: 'ti-circle-x',
  skipped: 'ti-circle-minus',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-text3',
  running: 'text-accent',
  completed: 'text-green',
  failed: 'text-red',
  skipped: 'text-text3',
}

interface StepStatusItemProps {
  step: {
    id: string
    type: string
    name: string
    status: StepStatus
    duration_ms: number | null
    error: string | null
  }
  sseState?: StepState
  /** AI 消息（仅 agent 步骤） */
  agentMessages?: ChatMessage[]
  /** 是否是当前活跃的 AI 步骤 */
  isActiveAgent?: boolean
  onApprove?: () => void
  onReject?: () => void
  approvePending?: boolean
  rejectPending?: boolean
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function StepStatusItem({
  step,
  sseState,
  agentMessages,
  isActiveAgent,
  onApprove,
  onReject,
  approvePending,
  rejectPending,
}: StepStatusItemProps) {
  const status = sseState?.status ?? step.status
  const durationMs = sseState?.duration_ms ?? step.duration_ms
  const error = sseState?.error ?? step.error
  const icon = STEP_TYPE_ICON[step.type] ?? 'ti-point'
  const isApprovalWaiting = step.type === 'approval' && status === 'running'
  const showAgentChat = step.type === 'agent' && (isActiveAgent || (agentMessages && agentMessages.length > 0))

  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 transition-colors',
        status === 'running'
          ? 'border-accent/40 bg-accent-dim/20'
          : status === 'failed'
            ? 'border-red/30 bg-red/5'
            : 'border-border bg-bg2',
      )}
    >
      {/* Step header */}
      <div className="flex items-center gap-2">
        <i className={cn('ti text-sm', icon, 'text-text3')} />
        <span className="flex-1 truncate text-xs font-medium text-text">
          {step.name}
        </span>
        <i className={cn('ti text-sm', STATUS_ICON[status], STATUS_COLOR[status])} />
        {durationMs != null && (
          <span className="text-[10px] tabular-nums text-text3">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="mt-1.5 text-[11px] text-red">{error}</p>
      )}

      {/* Agent chat area — embedded when step is agent type */}
      {showAgentChat && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <PipelineAgentChat
            messages={agentMessages ?? []}
            isStreaming={isActiveAgent ?? false}
          />
        </div>
      )}

      {/* Approval buttons */}
      {isApprovalWaiting && onApprove && onReject && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={approvePending}
            className="rounded-md bg-green px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green/90"
          >
            {approvePending ? '...' : '通过'}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={rejectPending}
            className="rounded-md bg-red px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red/90"
          >
            {rejectPending ? '...' : '拒绝'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create PipelineAgentChat**

Create `serverhub-ui/src/components/pipeline-run/PipelineAgentChat.tsx`:

```tsx
/**
 * PipelineAgentChat — AI 消息渲染区域（嵌入步骤流中）。
 * 渲染 agent_message / agent_tool_call / agent_tool_result 事件。
 */

import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/pages/agents/MarkdownContent'
import type { ChatMessage } from '@/hooks/usePipelineRunSSE'

interface PipelineAgentChatProps {
  messages: ChatMessage[]
  isStreaming: boolean
}

export function PipelineAgentChat({ messages, isStreaming }: PipelineAgentChatProps) {
  if (messages.length === 0 && !isStreaming) return null

  return (
    <div className="space-y-2">
      {messages.map((msg) => {
        if (msg.event_type === 'agent_tool_call' || msg.event_type === 'chat_tool_call') {
          return (
            <div key={msg.id} className="flex items-center gap-1.5 text-[11px] text-text3">
              <i className="ti ti-tool text-xs" />
              <span className="font-mono">{msg.tool}</span>
              <i className="ti ti-loader animate-spin text-xs" />
            </div>
          )
        }

        if (msg.event_type === 'agent_tool_result' || msg.event_type === 'chat_tool_result') {
          return (
            <div key={msg.id} className="rounded border border-border/50 bg-bg p-2 text-[11px] text-text3">
              <div className="flex items-center gap-1 mb-1">
                <i className="ti ti-check text-green text-xs" />
                <span className="font-mono">{msg.tool}</span>
              </div>
              {msg.content && (
                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                  {msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}
                </pre>
              )}
            </div>
          )
        }

        // assistant message (agent_message / chat_message)
        if (msg.role === 'assistant') {
          return (
            <div key={msg.id} className="text-sm leading-relaxed">
              {!msg.final && isStreaming ? (
                <span className="whitespace-pre-wrap">
                  {msg.content}
                  <span className="inline-block w-1.5 h-4 bg-accent/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                </span>
              ) : (
                <MarkdownContent content={msg.content} />
              )}
            </div>
          )
        }

        // user message
        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex justify-end">
              <div
                className={cn(
                  'max-w-[85%] rounded-xl rounded-br-sm px-3 py-2',
                  'bg-accent text-[#0f172a] text-xs',
                )}
              >
                {msg.content}
              </div>
            </div>
          )
        }

        return null
      })}

      {isStreaming && messages.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-text3">
          <i className="ti ti-loader animate-spin" />
          <span>AI 正在分析...</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create PipelineDecisionCard (P3-B placeholder)**

Create `serverhub-ui/src/components/pipeline-run/PipelineDecisionCard.tsx`:

```tsx
/**
 * PipelineDecisionCard — P3-B 决策卡片占位组件。
 * 将在 P3-B 阶段实现完整的人类决策交互。
 */

interface PipelineDecisionCardProps {
  prompt: string
  options: string[]
  onDecide?: (option: string) => void
}

export function PipelineDecisionCard({ prompt, options }: PipelineDecisionCardProps) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-amber-400">
        <i className="ti ti-alert-triangle" />
        需要人工决策
      </div>
      <p className="text-sm text-text mb-3">{prompt}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled
            className="rounded-md border border-border bg-bg2 px-3 py-1.5 text-xs text-text3 opacity-60"
            title="将在 P3-B 中实现"
          >
            {opt}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-text3">决策功能将在 P3-B 中实现</p>
    </div>
  )
}
```

- [ ] **Step 4: Create PipelineChatInput**

Create `serverhub-ui/src/components/pipeline-run/PipelineChatInput.tsx`:

```tsx
/**
 * PipelineChatInput — Pipeline 执行面板底部输入框。
 * 发送消息到 POST /api/pipelines/runs/{id}/chat。
 */

import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface PipelineChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  isStreaming?: boolean
}

export function PipelineChatInput({ onSend, disabled, isStreaming }: PipelineChatInputProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const msg = text.trim()
    if (!msg || disabled || isStreaming) return
    onSend(msg)
    setText('')
    inputRef.current?.focus()
  }, [text, disabled, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="border-t border-border bg-bg p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={isStreaming ? 'AI 正在回复...' : '输入消息或提问...'}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-border bg-bg2 px-3 py-2',
            'text-sm text-text placeholder:text-text3',
            'focus:border-accent focus:outline-none',
            'max-h-24',
            disabled && 'opacity-50',
          )}
          style={{ minHeight: '38px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || isStreaming || !text.trim()}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            text.trim() && !disabled && !isStreaming
              ? 'bg-accent text-[#0f172a] hover:bg-accent/90'
              : 'bg-bg2 text-text3',
          )}
        >
          <i className="ti ti-send" />
        </button>
      </div>
      <p className="mt-1 text-[10px] text-text3">
        <i className="ti ti-shield-check mr-0.5" />
        只读顾问模式 — 可查询状态和日志，不执行写入操作
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Create PipelineRunPanel (main container)**

Create `serverhub-ui/src/components/pipeline-run/PipelineRunPanel.tsx`:

```tsx
/**
 * PipelineRunPanel — Pipeline 混合执行面板主容器。
 *
 * 合并程序化步骤状态 + AI 节点对话 + 操作员侧聊。
 * 替代 PipelinesPage 中原有的 RunPanel 组件。
 */

import { useMemo, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { PipelineRun, StepDefinition, StepLog, StepStatus } from '@/api/pipelines'
import { usePipelineRunSSE } from '@/hooks/usePipelineRunSSE'
import { StepStatusItem } from './StepStatusItem'
import { PipelineAgentChat } from './PipelineAgentChat'
import { PipelineChatInput } from './PipelineChatInput'

function parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m${sec}s`
}

const RUN_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-text3/20 text-text3',
  running: 'bg-accent/20 text-accent',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green/20 text-green',
  failed: 'bg-red/20 text-red',
  cancelled: 'bg-text3/20 text-text3',
}

interface PipelineRunPanelProps {
  runId: string
  run: PipelineRun
  stepsJson: string
  stepLogs: StepLog[]
  onCancel: () => void
  onApprove: () => void
  onReject: () => void
  cancelPending: boolean
  approvePending: boolean
  rejectPending: boolean
}

export function PipelineRunPanel({
  runId,
  run,
  stepsJson,
  stepLogs,
  onCancel,
  onApprove,
  onReject,
  cancelPending,
  approvePending,
  rejectPending,
}: PipelineRunPanelProps) {
  const {
    stepStates,
    chatMessages,
    activeAgentStepId,
    connected,
    isChatStreaming,
    sendMessage,
  } = usePipelineRunSSE(runId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const isActive = run.status === 'running' || run.status === 'paused'

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages.length, stepStates.size])

  // 合并步骤定义 + 日志 + SSE 状态
  const mergedSteps = useMemo(() => {
    const defs = parseJsonSafe<StepDefinition[]>(stepsJson, [])
    return defs.map((step) => {
      const log = stepLogs.find((l) => l.step_id === step.id)
      const sse = stepStates.get(step.id)
      const status: StepStatus =
        (sse?.status as StepStatus) ?? (log?.status as StepStatus) ?? 'pending'
      return {
        id: step.id,
        type: step.type,
        name: step.name,
        status,
        duration_ms: sse?.duration_ms ?? log?.duration_ms ?? null,
        error: sse?.error ?? log?.error ?? null,
      }
    })
  }, [stepsJson, stepLogs, stepStates])

  // 按 step_id 分组 agent 消息
  const agentMessagesByStep = useMemo(() => {
    const map = new Map<string, typeof chatMessages>()
    for (const msg of chatMessages) {
      if (msg.step_id && (msg.event_type.startsWith('agent_') || msg.event_type.startsWith('chat_'))) {
        const arr = map.get(msg.step_id) ?? []
        arr.push(msg)
        map.set(msg.step_id, arr)
      }
    }
    return map
  }, [chatMessages])

  // 侧聊消息（无 step_id 的 chat 消息）
  const sidebarChatMessages = useMemo(
    () => chatMessages.filter((m) => !m.step_id && m.event_type.startsWith('chat_')),
    [chatMessages],
  )

  // 运行时长
  const elapsed = useMemo(() => {
    if (!run.started_at) return null
    const start = new Date(run.started_at).getTime()
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now()
    return end - start
  }, [run.started_at, run.completed_at])

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                RUN_STATUS_STYLES[run.status],
              )}
            >
              {run.status}
            </span>
            {connected && (
              <span className="flex items-center gap-1 text-xs text-green">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
                实时
              </span>
            )}
          </div>
          {isActive && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelPending}
              className="rounded-lg px-2.5 py-1 text-xs text-red transition-colors hover:bg-red/10"
            >
              {cancelPending ? '取消中...' : '取消运行'}
            </button>
          )}
        </div>

        <div className="text-xs text-text3">
          <span>触发: {run.trigger_type}</span>
          <span className="mx-2">|</span>
          <span>操作人: {run.started_by}</span>
          {elapsed != null && (
            <>
              <span className="mx-2">|</span>
              <span>耗时: {formatDuration(elapsed)}</span>
            </>
          )}
        </div>

        {run.error && (
          <div className="rounded-lg border border-red/30 bg-red/10 p-2 text-xs text-red">
            <i className="ti ti-alert-circle mr-1" />
            {run.error}
          </div>
        )}

        {run.summary && (
          <div className="rounded-lg border border-border bg-bg2 p-2 text-xs text-text2">
            <i className="ti ti-file-text mr-1" />
            {run.summary}
          </div>
        )}
      </div>

      {/* ── Step list + AI chat (scrollable) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text3">步骤进度</h4>
          {mergedSteps.map((step) => (
            <StepStatusItem
              key={step.id}
              step={step}
              sseState={stepStates.get(step.id)}
              agentMessages={agentMessagesByStep.get(step.id)}
              isActiveAgent={step.id === activeAgentStepId}
              onApprove={onApprove}
              onReject={onReject}
              approvePending={approvePending}
              rejectPending={rejectPending}
            />
          ))}
          {mergedSteps.length === 0 && (
            <p className="py-4 text-center text-xs text-text3">无步骤信息</p>
          )}
        </div>

        {/* 侧聊消息区域 */}
        {sidebarChatMessages.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text3">对话</h4>
            <PipelineAgentChat
              messages={sidebarChatMessages}
              isStreaming={isChatStreaming}
            />
          </div>
        )}
      </div>

      {/* ── Chat input ── */}
      <PipelineChatInput
        onSend={sendMessage}
        isStreaming={isChatStreaming}
      />
    </div>
  )
}
```

- [ ] **Step 6: Verify types compile**

```bash
cd ~/exps/serverhub/serverhub-ui
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
cd ~/exps/serverhub/serverhub-ui
git add src/components/pipeline-run/
git commit -m "feat(pipelines): add PipelineRunPanel and sub-components for P3-A execution panel"
```

---

## Task 11: PipelinesPage Integration

**Files:**
- Modify: `serverhub-ui/src/pages/PipelinesPage.tsx`

**Depends on:** Task 10

- [ ] **Step 1: Add import for PipelineRunPanel**

在 `PipelinesPage.tsx` 的 import 区域添加：

```tsx
import { PipelineRunPanel } from '@/components/pipeline-run/PipelineRunPanel'
```

- [ ] **Step 2: Replace right panel content**

替换 PipelinesPage.tsx 中右栏的内容（约 lines 870-888）。

将：

```tsx
        <div className="flex-1 overflow-y-auto">
          {watchRun ? (
            <RunPanel
              run={watchRun}
              steps={mergedSteps}
              onCancel={() => cancelMutation.mutate(watchRun.id)}
              onApprove={() => approveMutation.mutate(watchRun.id)}
              onReject={() => rejectMutation.mutate(watchRun.id)}
              cancelPending={cancelMutation.isPending}
              approvePending={approveMutation.isPending}
              rejectPending={rejectMutation.isPending}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-text3">
              <i className="ti ti-eye-off mb-3 text-3xl" />
              <p className="text-sm">暂无运行中的实例</p>
              <p className="mt-1 text-xs">触发 Pipeline 后在此查看实时进度</p>
            </div>
          )}
        </div>
```

替换为：

```tsx
        <div className="flex-1 overflow-hidden">
          {watchRun ? (
            <PipelineRunPanel
              runId={watchRun.id}
              run={watchRun}
              stepsJson={selectedPipeline?.steps_json ?? '[]'}
              stepLogs={runLogs}
              onCancel={() => cancelMutation.mutate(watchRun.id)}
              onApprove={() => approveMutation.mutate(watchRun.id)}
              onReject={() => rejectMutation.mutate(watchRun.id)}
              cancelPending={cancelMutation.isPending}
              approvePending={approveMutation.isPending}
              rejectPending={rejectMutation.isPending}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-text3">
              <i className="ti ti-eye-off mb-3 text-3xl" />
              <p className="text-sm">暂无运行中的实例</p>
              <p className="mt-1 text-xs">触发 Pipeline 后在此查看实时进度</p>
            </div>
          )}
        </div>
```

关键变更：
1. `RunPanel` → `PipelineRunPanel`（新组件，内置 SSE 管理）
2. 外层 `overflow-y-auto` → `overflow-hidden`（滚动由 PipelineRunPanel 内部管理）
3. 新增 `runId`、`stepsJson`、`stepLogs` props（PipelineRunPanel 自己管 SSE + 步骤合并）
4. 移除 `steps={mergedSteps}` prop（PipelineRunPanel 内部用自己的 mergedSteps）

- [ ] **Step 3: Remove unused usePipelineSSE hook call and mergedSteps**

在 PipelinesPage 主函数中，`usePipelineSSE` hook（约 line 612）和 `mergedSteps` memo（约 line 670）不再被右栏使用，但 **暂时保留**，因为它们可能被其他 tab（如 Visual tab 的画布联动）使用。如果确认无其他引用，可在后续 cleanup 中删除。

目前只需确认右栏渲染部分使用了新的 `PipelineRunPanel`。

- [ ] **Step 4: Remove the inline usePipelineSSE SSE-related state from right panel header**

在右栏头部（约 lines 862-867），SSE 连接状态指示器当前依赖 `sseConnected`。由于 PipelineRunPanel 内部管理 SSE 连接，头部的 SSE 状态指示器可以简化或移除。

将右栏头部：

```tsx
          {sseConnected && (
            <span className="ml-auto flex items-center gap-1 text-xs text-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
              实时
            </span>
          )}
```

替换为（移除，因为 PipelineRunPanel 内部有自己的连接指示器）：

```tsx
```

（直接删除这 5 行。）

- [ ] **Step 5: Verify — build + visual check**

```bash
cd ~/exps/serverhub/serverhub-ui
npm run build 2>&1 | tail -5
```

Expected: 构建成功，无错误。

然后手动验证：启动前后端，打开 Pipeline 页面，触发一个 Pipeline 运行，确认：
1. 右栏显示 PipelineRunPanel（标题栏 + 步骤进度 + 底部输入框）
2. 步骤实时更新
3. 底部输入框可见，显示"只读顾问模式"提示

- [ ] **Step 6: Commit**

```bash
cd ~/exps/serverhub/serverhub-ui
git add src/pages/PipelinesPage.tsx
git commit -m "feat(pipelines): integrate PipelineRunPanel into right column"
```

---

## Verification Checklist

在所有任务完成后，按以下清单验证 P3-A 成功标准（对照 spec Section 9）：

- [ ] Pipeline 运行时，右栏显示混合面板：步骤状态 + AI 节点对话 + 输入框
- [ ] AI 步骤执行时，消息通过 SSE 实时流式渲染（agent_message 事件）
- [ ] 用户在底部输入框提问，AI 基于 Pipeline 上下文回答（chat_message 事件）
- [ ] Pipeline Agent 使用 SAFE_TOOLS 只读白名单
- [ ] 执行 thread 和侧聊 thread 独立（不同 thread_id）
- [ ] 对话事件存储在 pipeline_chat_events 表，支持分页查询
- [ ] 刷新页面后可完整回看运行历史和 AI 对话（hydration）
- [ ] AI 步骤失败、Pipeline 取消等异常场景有正确的 UI 表现
- [ ] 不影响主 Agent 系统的稳定性
- [ ] `make smoke-test` 通过（如后端正在运行）
