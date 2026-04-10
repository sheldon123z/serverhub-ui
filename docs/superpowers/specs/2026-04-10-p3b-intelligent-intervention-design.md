# P3-B: 智能介入机制 — 设计文档

> Date: 2026-04-10
> Status: Draft
> Depends on: P3-A (已完成)
> Scope: `decision` 步骤类型 + AI 主动触发人类介入

## 1. 核心理念

P3-B 在 Pipeline 执行流程中引入**人类决策点**——不是简单的"通过/拒绝"二选一（已有 approval 步骤），而是**多选项路由**：AI 分析后提出多个方案，人类选择后 Pipeline 自动走对应分支。

```
                        AI 分析
                           │
                    ┌──────┴──────┐
                    │  发现 3 个   │
                    │  安全风险    │
                    └──────┬──────┘
                           │
                 ┌─────────┼─────────┐
                 ▼         ▼         ▼
              [修复全部]  [只修复P0]  [跳过]
                 │         │         │
                 ▼         ▼         ▼
            fix-all    fix-critical  skip-notify
              步骤       步骤        步骤
```

## 2. 两种介入模式

### 2.1 固定介入（设计时确定）

在 YAML 中声明 `decision` 步骤，Pipeline 执行到此步时暂停等待人类选择。

```yaml
steps:
  - id: security-scan
    type: agent
    prompt: "执行安全扫描并分析风险等级"

  - id: decide-action
    type: decision
    name: 安全修复决策
    prompt: "安全扫描完成，请选择修复策略"
    context_from: security-scan          # 引用前序步骤输出作为决策上下文
    options:
      - id: fix-all
        label: 修复全部问题
        description: 修复所有发现的安全问题（耗时较长）
        next_step: fix-all-step
      - id: fix-critical
        label: 仅修复高危
        description: 只修复 P0/P1 级别问题
        next_step: fix-critical-step
      - id: skip
        label: 跳过修复
        description: 记录但不修复，仅发送通知
        next_step: notify-only
    timeout: 3600                        # 超时秒数
    on_timeout: skip                     # 超时默认选项 ID
    assignee: admin                      # 决策人

  - id: fix-all-step
    type: playbook
    # ...
  - id: fix-critical-step
    type: shell
    # ...
  - id: notify-only
    type: notify
    # ...
```

### 2.2 AI 触发介入（运行时动态）

AI Agent 在执行 `agent` 步骤时发现需要人类决策，主动调用 `request_human_intervention` 工具触发决策请求。

```python
# AI Agent 调用此工具触发决策
request_human_intervention(
    prompt="发现 3 个安全问题，其中 1 个 P0 级别。建议立即修复。",
    options=[
        {"id": "fix-now", "label": "立即修复", "description": "执行自动修复脚本"},
        {"id": "defer", "label": "延后处理", "description": "记录到待办，下次维护窗口处理"},
    ]
)
```

## 3. 架构设计

### 3.1 与现有系统的关系

```
┌───────────────────────────────────────────────────┐
│                 Step 类型对比                        │
├───────────┬─────────────┬─────────────────────────┤
│           │  approval   │      decision           │
├───────────┼─────────────┼─────────────────────────┤
│ 选项      │ 通过/拒绝   │ 多个自定义选项           │
│ 路由      │ 继续/终止   │ 每个选项跳转到不同步骤   │
│ 上下文    │ 无          │ 引用前序步骤输出         │
│ 触发方式  │ 仅设计时    │ 设计时 + AI 运行时触发   │
│ 超时行为  │ 失败        │ 执行默认选项             │
│ SSE 事件  │ approval_   │ decision_request /       │
│           │ required    │ decision_resolved        │
└───────────┴─────────────┴─────────────────────────┘
```

### 3.2 执行引擎集成

`decision` 步骤复用 approval 的 pause-wait-resume 模式，但增加选项路由：

```python
# executor.py 中的 decision 步骤处理（伪代码）
if result.get("requires_decision"):
    # 1. 暂停运行
    await db.execute("UPDATE pipeline_runs SET status = 'paused' WHERE id = ?", (run_id,))
    
    # 2. 发布 decision_request 事件
    await publish_chat_event(run_id, "decision_request", {
        "step_id": step_id,
        "prompt": result["decision_prompt"],
        "options": result["options"],
        "context": result.get("context"),       # 前序步骤输出摘要
        "timeout": result.get("timeout", 3600),
        "on_timeout": result.get("on_timeout"),
    })
    
    # 3. 等待决策（复用 _wait_for_approval 模式，扩展为读取 chosen_option）
    chosen = await _wait_for_decision(run_id, step_id, result.get("timeout", 3600))
    
    if chosen is None:
        # 超时 → 使用默认选项
        chosen = result.get("on_timeout")
    
    # 4. 恢复运行
    await db.execute("UPDATE pipeline_runs SET status = 'running' WHERE id = ?", (run_id,))
    
    # 5. 根据选项路由到目标步骤
    target_step = next(
        (opt["next_step"] for opt in result["options"] if opt["id"] == chosen),
        None
    )
    if target_step:
        target_idx = next((j for j, s in enumerate(steps) if s.get("id") == target_step), None)
        if target_idx is not None:
            i = target_idx
            continue
```

### 3.3 AI 触发介入机制

`request_human_intervention` 作为 PipelineAgent 的工具，在 agent 步骤执行过程中调用：

```python
@tool
async def request_human_intervention(
    prompt: str,
    options: list[dict],
    timeout: int = 3600,
) -> str:
    """请求人类介入决策。Pipeline 将暂停直到人类做出选择。
    
    Args:
        prompt: 决策描述（展示给运维人员）
        options: 选项列表，每项包含 {id, label, description}
        timeout: 超时秒数（默认 3600）
    
    Returns:
        人类选择的选项 ID
    """
    run_id = _get_current_run_id()  # 从上下文获取
    step_id = _get_current_step_id()
    
    # 发布决策请求事件
    await publish_chat_event(run_id, "decision_request", {
        "step_id": step_id,
        "prompt": prompt,
        "options": options,
        "timeout": timeout,
        "source": "ai",  # 标记为 AI 触发
    })
    
    # 等待人类决策
    chosen = await _wait_for_decision(run_id, step_id, timeout)
    return chosen or "timeout"
```

**问题**：Agent 步骤在 executor 循环中是同步执行的（`agent.ainvoke()`），工具调用需要在 Agent 运行过程中暂停整个执行流。

**方案**：利用 LangGraph 的 `interrupt` 机制——当 `request_human_intervention` 被调用时，返回一个特殊标记让 Agent graph 中断。executor 检测到中断后进入 pause 状态，等待人类决策后恢复 Agent 继续执行。

```python
# 方案：使用 LangGraph interrupt
from langgraph.prebuilt import interrupt

@tool
def request_human_intervention(prompt: str, options: list[dict], timeout: int = 3600) -> str:
    """请求人类介入决策"""
    # interrupt() 会暂停 graph 执行，等待外部 resume
    result = interrupt({
        "type": "decision",
        "prompt": prompt,
        "options": options,
        "timeout": timeout,
    })
    return result  # 人类选择的选项 ID
```

### 3.4 决策 API

```
POST /api/pipelines/runs/{run_id}/decide
Body: {
    "step_id": "decide-action",
    "option_id": "fix-critical",
    "decided_by": "admin"          // 自动从 JWT 获取
}

Response: {"ok": true}
```

### 3.5 SSE 事件协议

新增 2 个事件类型：

| 事件 | 数据字段 | 来源 |
|------|---------|------|
| `decision_request` | `step_id, prompt, options[], context?, timeout, on_timeout?, source` | executor / AI 工具 |
| `decision_resolved` | `step_id, chosen_option_id, decided_by` | decide API |

`decision_request` 事件存入 `pipeline_chat_events` 表，支持断线重连回放。

### 3.6 数据存储

扩展 `pipeline_step_logs`：

```sql
-- 在 pipeline_step_logs 表中，decision 步骤的记录
-- status: 'waiting_decision' → 'decided'
-- input_json: {prompt, options, timeout, on_timeout, context}
-- output_json: {chosen_option_id, decided_by, decided_at}
```

不需要新建表——复用现有 `pipeline_step_logs`（status 字段新增 `waiting_decision` / `decided` 值）和 `pipeline_chat_events`（事件持久化）。

## 4. 前端设计

### 4.1 PipelineDecisionCard 升级

从占位组件升级为交互式决策卡片：

```
┌──────────────────────────────────┐
│ ⚠️ 需要人工决策                    │
│                                  │
│ 安全扫描完成，请选择修复策略         │
│                                  │
│ 📋 扫描结果摘要:                   │  ← context_from 前序步骤输出
│ • 1 个 P0 高危漏洞                │
│ • 2 个 P1 中危问题                │
│ • 5 个 P2 低危建议                │
│                                  │
│ ┌──────────┐ ┌────────┐ ┌────┐  │
│ │✦ 修复全部 │ │仅修复P0 │ │跳过│  │
│ │ 耗时约30m │ │ 耗时5m  │ │    │  │
│ └──────────┘ └────────┘ └────┘  │
│                                  │
│ ⏱ 超时倒计时: 58:42              │  ← 实时倒计时
│ 超时将自动选择: 跳过               │
└──────────────────────────────────┘
```

### 4.2 组件集成

```
StepStatusItem
├── step.type === 'decision' && status === 'running'
│   └── PipelineDecisionCard
│       ├── prompt 文本
│       ├── context 摘要（从前序步骤输出渲染）
│       ├── options 按钮组
│       ├── 超时倒计时
│       └── onDecide → POST /runs/{id}/decide
│
├── step.type === 'agent' && hasDecisionRequest
│   └── PipelineDecisionCard  (AI 触发的决策，嵌入 agent chat 区域)
│       └── 同上，但 source === 'ai'
```

### 4.3 SSE 事件处理

在 `usePipelineRunSSE` 的 `dispatchEvent` 中添加：

```typescript
// ── 决策事件 ──
if (type === 'decision_request') {
    next.pendingDecision = {
        stepId: evt.step_id,
        prompt: evt.content ?? '',
        options: evt.args?.options ?? [],
        context: evt.args?.context,
        timeout: evt.args?.timeout,
        onTimeout: evt.args?.on_timeout,
        source: evt.args?.source ?? 'step',
        requestedAt: evt.timestamp,
    }
    return next
}
if (type === 'decision_resolved') {
    next.pendingDecision = null
    return next
}
```

## 5. 修改清单

### 5.1 后端新增

| 文件 | 职责 |
|------|------|
| `modules/pipelines/steps/decision.py` | `decision` 步骤执行器 |

### 5.2 后端修改

| 文件 | 改动 |
|------|------|
| `modules/pipelines/models.py` | STEP_TYPES 添加 `"decision"` + StepDefinition 新增决策字段 |
| `modules/pipelines/steps/__init__.py` | _STEP_MODULES 注册 decision |
| `modules/pipelines/executor.py` | 添加 `_wait_for_decision()` + decision 结果处理 + 路由跳转 |
| `modules/pipelines/routes.py` | 实现 `POST /runs/{id}/decide` 端点 |
| `modules/pipelines/pipeline_agent.py` | 添加 `request_human_intervention` 工具 |
| `modules/pipelines/tools/pipeline_tools.py` | 新增 `request_human_intervention` 工具定义 |
| `modules/pipelines/compiler.py` | decision 节点编译 + Mermaid 菱形渲染 |
| `modules/pipelines/templates.py` | 更新模板使用 decision 步骤（替代部分 condition） |

### 5.3 前端修改

| 文件 | 改动 |
|------|------|
| `components/pipeline-run/PipelineDecisionCard.tsx` | 从占位升级为交互式 |
| `components/pipeline-run/StepStatusItem.tsx` | 渲染 decision 步骤状态 + 嵌入 DecisionCard |
| `hooks/usePipelineRunSSE.ts` | 添加 pendingDecision 状态 + decision 事件处理 |
| `api/pipelines.ts` | 新增 `submitDecision` API 方法 + Decision 类型 |

### 5.4 前端新增

| 文件 | 职责 |
|------|------|
| `components/pipeline-run/DecisionCountdown.tsx` | 超时倒计时组件 |

## 6. 成功标准

1. YAML 中可声明 `decision` 步骤，Pipeline 执行到此步时暂停并显示选项
2. 人类选择选项后，Pipeline 自动路由到对应的后续步骤
3. 超时时自动执行默认选项
4. AI Agent 可通过 `request_human_intervention` 工具动态触发决策
5. 决策事件通过 SSE 实时推送，支持断线重连回放
6. 决策卡片显示上下文摘要 + 超时倒计时
7. 不影响现有 approval 步骤的功能

## 7. 不做的事（YAGNI）

- 不做决策投票（多人投票选择）— 当前只支持单人决策
- 不做决策撤回（选择后不可更改）
- 不做决策 AI 建议（AI 不推荐选项，只呈现）
- 不做决策历史分析（统计各选项选择频率）
- 不做条件化选项（根据上下文动态显示/隐藏选项）

## 8. 预估工作量

| 部分 | 工作量 |
|------|--------|
| decision 步骤执行器 + executor 集成 | 2h |
| decide API + 数据存储 | 1h |
| request_human_intervention 工具 | 1.5h |
| compiler + Mermaid 支持 | 1h |
| 前端 DecisionCard + SSE + API | 2h |
| 模板更新 + 测试 | 1h |
| **总计** | **~8.5h** |
