# P3-B: 智能介入机制 — 设计文档

> Date: 2026-04-10
> Status: Draft (v2 — Codex Review 修订)
> Depends on: P3-A (已完成)
> Scope: `decision` 步骤类型 + AI 主动触发人类介入
> Review: 2026-04-10 Codex Adversarial Review 修正 3 个 HIGH 问题

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

### 3.4 决策 API — 原子性与幂等性

**关键设计**：每个决策请求有唯一 `decision_request_id`，解析使用 compare-and-swap 语义防止竞态。

```
POST /api/pipelines/runs/{run_id}/decide
Body: {
    "step_id": "decide-action",
    "decision_request_id": "dr-uuid-xxx",   // 必填，来自 decision_request 事件
    "option_id": "fix-critical"
    // decided_by 自动从 JWT 获取
}

Response (成功): {"ok": true, "option_id": "fix-critical", "decided_by": "admin"}
Response (已决策): {"ok": true, "already_decided": true, "option_id": "fix-critical"}
Response (过期):  HTTPException(409, "决策请求已过期或不存在")
```

**原子解析流程**：

```python
async def resolve_decision(run_id, step_id, decision_request_id, option_id, decided_by):
    db = await get_db()
    # Compare-and-swap: 只有 status='waiting_decision' 且 request_id 匹配时才更新
    result = await db.execute(
        """UPDATE pipeline_step_logs
           SET status = 'decided',
               output_json = json_object(
                   'chosen_option_id', ?,
                   'decided_by', ?,
                   'decided_at', datetime('now'),
                   'decision_request_id', ?
               ),
               completed_at = datetime('now')
           WHERE run_id = ? AND step_id = ? AND status = 'waiting_decision'""",
        (option_id, decided_by, decision_request_id, run_id, step_id),
    )
    await db.commit()
    if result.rowcount == 0:
        # 可能已被决策（幂等返回）或已过期
        existing = await db.execute_fetchone(
            "SELECT output_json FROM pipeline_step_logs WHERE run_id = ? AND step_id = ? AND status = 'decided'",
            (run_id, step_id),
        )
        if existing:
            return {"already_decided": True, **json.loads(existing["output_json"])}
        raise HTTPException(409, "决策请求已过期或不存在")
    return {"ok": True, "option_id": option_id}
```

**幂等性保证**：
- 同一 `decision_request_id` 的重复提交返回首次决策结果
- 不同 `decision_request_id` 的提交被拒绝（409）
- 超时后的提交被拒绝（status 已不是 `waiting_decision`）

### 3.5 SSE 事件协议 — 统一载荷格式

新增 2 个事件类型。**载荷字段与 `publish_chat_event` 参数严格对齐**，确保 SSE 实时流和 `pipeline_chat_events` 回放一致。

| 事件 | 存储方式 | 说明 |
|------|---------|------|
| `decision_request` | `pipeline_chat_events` 持久化 + SSE 广播 | 通过 `publish_chat_event` 发布 |
| `decision_resolved` | `pipeline_chat_events` 持久化 + SSE 广播 | 通过 `publish_chat_event` 发布 |

**`decision_request` 事件载荷（标准化）**：

```python
# 后端发布时
await publish_chat_event(
    run_id, "decision_request",
    {
        "decision_request_id": dr_id,      # 唯一请求 ID
        "prompt": "安全扫描完成...",         # 决策描述
        "options": [...],                   # 选项列表
        "context": "...",                   # 前序步骤输出摘要
        "timeout": 3600,                   # 超时秒数
        "on_timeout": "skip",             # 超时默认选项
        "source": "step",                  # "step" | "ai"
    },
    step_id=step_id,
    content="安全扫描完成...",              # content = prompt（用于回放兼容）
)
```

**前端消费时**（对齐 `publish_chat_event` 的存储格式）：

```typescript
// publish_chat_event 存入 pipeline_chat_events 时：
// - content 列 = prompt 文本
// - metadata_json 列 = {decision_request_id, options, context, timeout, on_timeout, source}
// 
// hydrateFromHistory 回放时：
// - evt.content = prompt
// - metadata_json 被 spread 到 evt 上（见 usePipelineRunSSE hydration 代码）
// 
// 因此前端统一读取：
if (type === 'decision_request') {
    next.pendingDecision = {
        decisionRequestId: evt.decision_request_id,  // from metadata_json spread
        stepId: evt.step_id,
        prompt: evt.content ?? '',                    // from content column
        options: evt.options ?? [],                   // from metadata_json spread
        context: evt.context,
        timeout: evt.timeout,
        onTimeout: evt.on_timeout,
        source: evt.source ?? 'step',
        requestedAt: evt.timestamp,
    }
    return next
}
```

**关键保证**：SSE 实时事件和 `getChatEvents` 历史回放产生完全相同的字段结构，断线重连后决策面板可正确恢复。

### 3.6 数据存储

**不需要新建表**——复用现有两个表：

**`pipeline_step_logs`**（步骤状态追踪）：

```sql
-- decision 步骤的生命周期
-- status: 'waiting_decision' → 'decided' (原子 CAS 更新)
-- input_json: {
--   prompt, options, timeout, on_timeout, context, 
--   decision_request_id    ← 唯一请求 ID，用于幂等校验
-- }
-- output_json: {
--   chosen_option_id, decided_by, decided_at,
--   decision_request_id    ← 回写，用于审计
-- }
```

**`pipeline_chat_events`**（事件持久化 + 回放）：

```sql
-- decision_request 事件存储
-- event_type = 'decision_request'
-- step_id = 决策步骤 ID
-- content = prompt 文本
-- metadata_json = {decision_request_id, options, context, timeout, on_timeout, source}

-- decision_resolved 事件存储
-- event_type = 'decision_resolved'
-- step_id = 决策步骤 ID
-- content = chosen_option_id
-- metadata_json = {decided_by, decision_request_id}
```

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
| `components/pipeline-run/PipelineDecisionCard.tsx` | 从占位升级为交互式（含 `decisionRequestId` 传递） |
| `components/pipeline-run/StepStatusItem.tsx` | 渲染 decision 步骤状态 + 嵌入 DecisionCard |
| `hooks/usePipelineRunSSE.ts` | 添加 `pendingDecision` 状态（含 `decisionRequestId`） + decision 事件处理 |
| `api/pipelines.ts` | 新增 `submitDecision(runId, stepId, decisionRequestId, optionId)` API 方法 + Decision 类型 |

### 5.4 前端新增

| 文件 | 职责 |
|------|------|
| `components/pipeline-run/DecisionCountdown.tsx` | 超时倒计时组件 |

### 5.5 可视化编辑器兼容（前端修改）

`decision` 步骤引入后，可视化编辑器必须同步支持，否则在 Visual tab 中编辑会**静默丢弃** decision 步骤的 `options`、`next_step` 路由等关键字段（因为 `useFlowToYaml.ts` 无法序列化未知步骤类型）。

| 文件 | 改动 |
|------|------|
| `api/pipelines.ts` | `StepDefinition.type` 联合类型添加 `'decision'` |
| `components/pipeline-flow/StepPalette.tsx` | STEP_TYPES 数组 + STEP_LABELS 添加 decision |
| `components/pipeline-flow/nodes/index.ts` | NODE_COLORS + NODE_ICONS + NODE_LABELS + nodeTypes 注册 decision |
| `components/pipeline-flow/property-forms/index.ts` | 添加 DecisionPropertyForm（编辑 prompt/options/timeout/on_timeout） |
| `components/pipeline-flow/useFlowToYaml.ts` | 添加 decision 步骤序列化（保留 options + next_step 路由） |
| `components/pipeline-flow/useYamlToFlow.ts` | 添加 decision 步骤反序列化（options → edges） |
| `lib/ui-schema-validation.ts` | 添加 decision 步骤的字段校验规则 |

**Mermaid 渲染**（后端 compiler.py 已在 5.2 后端修改中列出）：decision 节点使用 `{菱形}` 形状（与 condition 一致但颜色不同），每个 option 生成一条带标签的边。

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
