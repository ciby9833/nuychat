**结论**

按现在 `apps/api` 的最新实现看，这套 AI 架构**已经不是**“一个 prompt + 一个模型 = 一个机器人”。  
更准确地说，它现在是：

**渠道收发/调度分配是系统层。AI 是独立运行时模块，用来做理解、抽取、任务分解、工具调用、记忆编码。**

所以你提出的原则：

**Prompt 是 UI，不是系统。**

在这套后端里，**大方向已经成立**。  
但还没有做到 100% 纯粹，**最大的残留问题是 handoff 仍有一部分靠 prompt 文本协议驱动**，这一点后面我会单独指出。

---

**一、现在 AI 相关的真实分层**

可以把当前后端拆成 6 层：

1. **渠道与会话事实层**
   客户消息进入系统、会话存在、队列分配、所有权变化，这些都不由 AI 决定。  
   核心在 [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts)、[routing-execution.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-execution.service.ts)。

2. **路由与调度决策层**
   系统先基于 tenant 配置、路由规则、当前 owner、人工活跃状态、容量等生成 routing plan，再决定这一轮是不是让 AI 参与。  
   核心在 [routing-decision.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-decision.service.ts)。

3. **AI 运行时层**
   只有 routing plan 选中 AI，且没有被人工独占，会进入 orchestrator。  
   核心在 [orchestrator.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts)。

4. **能力与执行治理层**
   AI 能看到什么工具、能不能执行、有没有超限，不靠 prompt，而靠 skill registry + runtime governance。  
   核心在 [skill.registry.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/skill.registry.ts)、[runtime-governance.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts)。

5. **任务与异步执行层**
   AI 不是直接“深入系统乱操作”，而是把外部订单查询、物流跟踪、记忆编码、向量重建等交给 task engine。  
   核心在 [task-engine.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts)、[task-vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts)。

6. **记忆 / Encoder / 向量层**
   AI 不靠把所有历史会话一次塞给模型，而是通过结构化 encoder、长期记忆、画像、状态快照、混合检索来拿上下文。  
   核心在 [customer-intelligence.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts)、[memory-encoder.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts)、[vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/vector-memory.service.ts)。

---

**二、能力到底是不是系统层决定**

答案是：**绝大部分已经是系统层决定，不是 prompt 决定。**

系统层现在决定这些事：

- 这一轮是否允许 AI 介入  
  见 [routing-decision.service.ts#L19](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-decision.service.ts#L19)

- 当前 owner 是 human 还是 AI，是否 preserve human owner  
  见 [routing-decision.service.ts#L24](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-decision.service.ts#L24)

- 如果会话已 `human_active`，AI 直接跳过  
  见 [routing.worker.ts#L79](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts#L79)

- 用哪个 provider / model / access mode  
  见 [provider-config.service.ts#L36](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/ai/provider-config.service.ts#L36)

- 当前 tenant 下有哪些技能可见、可执行  
  见 [runtime-governance.service.ts#L40](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts#L40)

- AI 是否在 whitelist、是否超过 rate limit  
  见 [runtime-governance.service.ts#L78](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts#L78)

- 外部任务是否走异步 task engine  
  见 [task-engine.service.ts#L343](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts#L343)

- 记忆如何编码、如何检索、如何重建向量索引  
  见 [memory-encoder.service.ts#L479](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L479)、[customer-intelligence.service.ts#L743](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L743)

这说明当前架构的本质已经是：

**系统编排能力，模型负责语义。**

不是“prompt 定义能力”。

---

**三、Prompt 现在还承担了什么**

Prompt 现在主要承担的是：

- 语言风格
- 回复形式
- 品牌/角色语气
- 一些行为提醒

这部分可以理解为 UI / 表达层，没有问题。

但有一处还不够干净：

- orchestrator 仍然要求模型在需要转人工时输出 `HANDOFF_REQUIRED: ...`
- 系统再通过字符串解析把它识别成 handoff

见 [orchestrator.service.ts#L65](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts#L65) 和 [orchestrator.service.ts#L279](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts#L279)

这说明：

**Prompt 现在不是纯 UI，它还残留了一点控制协议角色。**

这是当前 AI 架构里最明显的“不彻底”。

---

**四、你最关心的点：核心客户座席渠道收发和调度，是否已不受 AI 干扰**

从当前代码看，答案是：

**基本已经做到。**

理由很直接：

- 入站后先走 routing plan，不是先跑 AI  
  见 [routing.worker.ts#L48](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts#L48)

- 如果 plan 选 human，AI 完全不运行  
  见 [routing.worker.ts#L48](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts#L48)

- 如果当前是人工活跃态，AI 也不运行  
  见 [routing.worker.ts#L79](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts#L79)

- queue assignment / ownership 更新由 routing execution 写入，不由模型写入  
  见 [routing-execution.service.ts#L12](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-execution.service.ts#L12)

所以现在实际架构已经接近你想要的形态：

**渠道层和调度层是主系统。AI 是被系统调用的独立模块。**

AI 主要负责：

- 抽取信息
- 生成回应
- 分解任务
- 调用受控技能
- 写入记忆
- 触发异步任务

它不是会话调度总控。

---

**五、AI 能力实现现在是怎样闭环的**

当前 AI 能力链路已经形成一个比较完整的闭环：

1. **系统决定 AI 是否介入**
   `routing decision`

2. **AI 运行时加载受控上下文**
   当前消息 + 近期工作记忆 + 客户画像 + 状态快照 + 相关长期记忆  
   见 [customer-intelligence.service.ts#L883](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L883)

3. **AI 只调用系统暴露的技能**
   不是模型想象有什么能力就有什么能力  
   见 [runtime-governance.service.ts#L78](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts#L78)

4. **任务进入异步执行层**
   订单查询、物流、向量重建、记忆编码都可异步化  
   见 [task-engine.service.ts#L343](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts#L343)

5. **事件被 encoder 编码成长期记忆**
   不是单纯存原文，而是 `fact / preference / unresolved_issue / commitment / outcome` 等结构化单元  
   见 [memory-encoder.service.ts#L479](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L479)

6. **向量库和检索层持续修复**
   profile / memory unit 有独立索引任务、失败重试、批量重建  
   见 [task-vector-memory.service.ts#L29](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts#L29)

7. **系统自我观测与迭代**
   有 encoder trace、recall trace、eval dataset、eval report  
   见 [tenant-memory-observability.routes.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tenant/tenant-memory-observability.routes.ts#L20)

这说明 AI 子系统已经不是“prompt bot”，而是一个：

**可治理、可观测、可修复、可评测的能力模块。**

---

**六、当前还存在的架构问题**

如果按你的标准严格看，当前还差这几步：

- **handoff 仍是文本协议，不是一等系统动作**
- **某些行为约束仍靠 system prompt 提醒，而不是 policy engine 强制**
- **tool usage obligation 还没完全结构化**
  现在“能不能用工具”是系统决定，但“什么时候必须先查知识库/先查订单”还没有完全从 prompt 中剥离

所以结论不是“全部错误”，而是：

**底座方向是对的，但控制面还没完全从 prompt 迁移到系统规则。**

---

**七、我给你的最终判断**

如果你的原则是：

**Prompt 是 UI，不是系统。AI 应独立于座席渠道与调度核心。**

那么当前 `apps/api` 的状态可以概括为：

- **渠道收发与调度分配，已经基本独立于 AI**
- **AI 已经是独立模块，承担理解、抽取、执行、记忆、任务分解**
- **能力大多由系统层决定，不由 prompt 决定**
- **但尚未完全纯化，handoff 和少量行为约束仍有 prompt 依赖**



**AI 架构审查报告**

**1. 当前 AI 全量模块地图**

`apps/api` 现在的 AI 相关后端，不是一个单体机器人，而是 6 个相互解耦的层：

1. **渠道 / 会话事实层**
   客户消息进入系统、会话存在、owner 和 queue 的变化都在这里处理，AI 不负责定义这些事实。入口和执行分别在 [routing.worker.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts) 和 [routing-execution.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-execution.service.ts)。

2. **路由 / 调度决策层**
   系统基于 tenant 配置、路由规则、人工状态、容量、override 生成 routing plan，再决定这一轮要不要引入 AI。核心在 [routing-decision.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-decision.service.ts)。

3. **AI 运行时层**
   AI 只在被 routing plan 选中时运行。它负责理解输入、调用工具、生成回复、触发后续任务。核心在 [orchestrator.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts)。

4. **能力 / 技能治理层**
   AI 能看到什么工具、能否执行、是否超限，不由 prompt 决定，而是由 skill registry 和 runtime governance 决定。核心在 [skill.registry.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/skill.registry.ts) 和 [runtime-governance.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts)。

5. **任务执行层**
   外部订单查询、物流跟踪、记忆编码、向量重建等都通过任务系统执行，而不是让模型直接改系统。核心在 [task-engine.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts) 和 [task-vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-vector-memory.service.ts)。

6. **记忆 / Encoder / 向量层**
   AI 不靠塞入全部历史会话，而是依赖结构化记忆、画像、状态、向量检索、召回评测。核心在 [customer-intelligence.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts)、[memory-encoder.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts)、[vector-memory.service.ts](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/vector-memory.service.ts)。

这说明当前架构本质上已经是：

**主系统负责渠道和调度，AI 作为独立模块提供智能能力。**

---

**2. 能力实现矩阵**

从代码上看，下面这些能力已经明确是**系统层**决定的，不是 prompt 决定的：

- **这一轮是否运行 AI**
  [routing-decision.service.ts#L19](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-decision.service.ts#L19)

- **当前 owner 是 human 还是 AI**
  [routing-decision.service.ts#L207](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/routing-engine/routing-decision.service.ts#L207)

- **如果人工已激活，则 AI 不介入**
  [routing.worker.ts#L79](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/workers/routing.worker.ts#L79)

- **使用哪个 provider / model**
  [provider-config.service.ts#L36](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/ai/provider-config.service.ts#L36)

- **AI 可用哪些技能**
  [runtime-governance.service.ts#L40](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts#L40)

- **技能是否允许执行、是否命中 whitelist、是否超频**
  [runtime-governance.service.ts#L78](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/skills/runtime-governance.service.ts#L78)

- **任务是否异步入队**
  [task-engine.service.ts#L343](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/tasks/task-engine.service.ts#L343)

- **记忆如何编码、如何召回、如何修复索引**
  [memory-encoder.service.ts#L479](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/memory-encoder.service.ts#L479)、[customer-intelligence.service.ts#L743](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/memory/customer-intelligence.service.ts#L743)

Prompt 现在主要影响的是：

- 语气
- 表达方式
- 品牌人格
- 回复风格
- 少量行为提醒

所以从能力定义角度看，当前系统已经基本满足：

**能力是系统层定义，prompt 更像 UI。**

---

**3. 交互规则与控制边界**

现在的实际交互规则是：

- 客户消息先进入主系统，不先进入 AI
- 主系统先算 routing plan
- 如果 plan 选 human，AI 完全跳过
- 如果人工已激活，AI 仍跳过
- 只有系统允许时，AI 才运行
- AI 只能调用系统暴露的技能
- 技能执行要过 runtime governance
- 高成本或外部动作进入 task engine
- 对话结束后再进入记忆编码、画像更新、向量重建

这意味着：

**AI 并不直接控制客户座席渠道的收发和调度。**  
它只是一个被系统调度的能力模块。

这正符合你要的边界：

- **座席渠道收发机制**：属于主系统
- **调度分配机制**：属于 routing / ownership / queue
- **AI**：独立做抽取、理解、任务分解、工具执行、记忆沉淀

---

**4. 必须继续去 prompt 化的改造清单**

虽然大方向是对的，但还没有完全纯化。当前最明显的残留问题有 3 个。

1. **handoff 仍靠文本协议**
   当前 orchestrator 让模型输出 `HANDOFF_REQUIRED: ...`，系统再解析字符串决定交接。见 [orchestrator.service.ts#L65](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts#L65) 和 [orchestrator.service.ts#L279](/Users/ellis/Documents/nuychat/nuyess-chat/apps/api/src/modules/orchestrator/orchestrator.service.ts#L279)。
   这说明 handoff 还不是纯系统动作，而是 prompt 协议。

2. **部分行为要求仍写在 prompt 里**
   比如什么时候先查知识库、什么时候要更谨慎、什么时候建议转人工，这些还有一部分是 prompt 提示，不是 policy engine 硬约束。

3. **tool usage obligation 还不够系统化**
   现在系统能决定“是否允许调用工具”，但还没有完全决定“哪些场景必须先调用什么工具”。

所以当前最准确的判断是：

**架构不是错的。**  
**但它还没有完全完成从 prompt-driven 到 policy-driven / action-driven 的迁移。**

---

**最终判断**

如果用你这句话做标准：

**Prompt 是 UI，不是系统。**

那么 `apps/api` 当前状态是：

- **核心渠道与调度已基本独立于 AI**
- **AI 已经是独立模块，而不是主系统本体**
- **能力大多由系统层决定，不靠 prompt**
- **但还残留少量 prompt 充当控制协议，尤其是 handoff**

所以这套系统不能被定义成：

**一个 prompt + 一个模型 = 一个机器人**

更准确的定义应该是：

**一个主系统 + 路由调度 + 受控 AI 运行时 + 技能治理 + 任务系统 + 记忆系统**
