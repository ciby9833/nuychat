# Skills 技能创建与维护操作手册

## 1. 文档目的

这份文档用于指导租户管理员在系统中创建和维护 **AI 技能（Skill Package）**。

当前系统里的技能不是旧的 connector / executor 配置方式，而是统一的 **Skill Package**：

- `Metadata`
- `SKILL.md`
- `FORMS.md`
- `REFERENCE.md`
- `Scripts`
- `环境变量`

也就是说，你维护的是一个完整技能包，而不是单独维护接口、签名器、工具目录。

---

## 2. 技能是什么

一个技能可以理解成：

- AI 什么时候应该用它
- AI 用它时需要什么输入
- 真正执行逻辑怎么跑
- 执行结果如何回复客户

例如：

- `J&T 物流轨迹查询`
- `订单详情查询`
- `图片文字识别`
- `退款单创建`

---

## 3. 技能页面里每一块是做什么的

创建或编辑技能时，页面通常会有这几部分：

### 3.1 Metadata

这是技能的轻量描述，供系统和模型快速识别。

需要填写：

- `能力名称`
  - 给人看的名称
  - 例如：`J&T 物流轨迹查询`

- `编码`
  - 给系统识别的唯一编码
  - 建议只用小写字母、数字、下划线
  - 例如：`jt_cargo_trace`

- `分类`
  - 给管理员自己分类使用
  - 例如：`logistics`、`order`、`ocr`

- `状态`
  - `active`：启用
  - `inactive`：停用

- `说明`
  - 用一句话说明这个技能解决什么问题
  - 例如：`查询 J&T Cargo 运单的完整物流轨迹和签收状态`

### 3.2 SKILL.md

这是技能最重要的说明。

它告诉 AI：

- 这个技能做什么
- 什么时候使用
- 什么时候不要使用
- 需要什么输入
- 返回什么结果
- 异常怎么处理

建议至少写下面这几个部分：

```md
# 这个能力做什么

# 什么时候使用

# 什么时候不要使用

# 需要什么输入

# 返回什么结果

# 异常如何处理
```

### 3.3 FORMS.md

这是参数填写说明。

它主要解决：

- 脚本需要什么字段
- 字段叫什么
- 多个值怎么传
- 缺少参数时应该如何澄清

例如：

```md
# 参数说明

- billCodes：运单号
- 多个运单号用英文逗号分隔
- 最多一次查询 30 个
```

### 3.4 REFERENCE.md

这是详细参考资料。

它适合放：

- API 文档摘要
- 状态码说明
- 错误码说明
- 字段定义
- 扫描类型说明

例如：

```md
# scanType 说明

- Tanda Terima：已签收
- Scan Kirim：发出扫描
- Scan Sampai：到件扫描
```

### 3.5 Resources

资源是补充资料，不是执行脚本。

适合放：

- `scanType.md`
- `error_code.md`
- `faq.md`
- `example_request.md`

资源的作用是：

- 给 AI 参考
- 给管理员维护知识
- 给技能补充上下文

### 3.6 Scripts

脚本是真正执行技能的地方。

如果技能只是说明，没有脚本，那么它只能“被理解”，不能真正执行复杂动作。

脚本里维护：

- `scriptKey`
- `名称`
- `语言`
- `文件名`
- `脚本内容`
- `环境变量`

---

## 4. 创建技能的标准步骤

建议按下面顺序创建：

### 步骤 1：先明确技能目标

先想清楚：

- 这个技能是查什么、做什么、识别什么
- 输入是什么
- 输出是什么

例如：

- 技能名称：`J&T 物流轨迹查询`
- 输入：`billCodes`
- 输出：物流轨迹、签收状态、最新节点

### 步骤 2：填写 Metadata

示例：

- 能力名称：`J&T 物流轨迹查询`
- 编码：`jt_cargo_trace`
- 分类：`logistics`
- 状态：`active`
- 说明：`查询 J&T Cargo 运单的完整物流轨迹`

### 步骤 3：写 SKILL.md

示例：

```md
# J&T 物流轨迹查询

## 这个能力做什么
查询 J&T Cargo 运单的完整物流轨迹与签收状态。

## 什么时候使用
- 用户询问快递到哪里了
- 用户询问物流状态
- 用户提供 J&T 运单号

## 什么时候不要使用
- 不是 J&T 运单
- 用户没有提供任何可查询单号

## 需要什么输入
- 运单号 billCodes

## 返回什么结果
- 完整轨迹时间线
- 最新状态
- 是否签收

## 异常如何处理
- 没有运单号：向客户索取运单号
- 接口异常：提示稍后重试
```

### 步骤 4：写 FORMS.md

示例：

```md
# 参数说明

- billCodes：J&T 运单号
- 多个运单号用英文逗号分隔
- 最多 30 个
```

### 步骤 5：写 REFERENCE.md

示例：

```md
# J&T 接口说明

- 请求方式：POST
- Content-Type：application/x-www-form-urlencoded
- body 字段：bizContent
- bizContent 结构：{"billCodes":"运单号"}
```

### 步骤 6：写脚本

脚本负责真正执行。

常见原则：

- 从 `stdin` 读取输入 JSON
- 从环境变量读取密钥
- 调用外部接口
- 最后打印 JSON 到 `stdout`

---

## 5. 脚本如何写

### 5.1 基本结构

Python 脚本建议结构：

```python
import sys
import json
import os


def read_input():
    raw = sys.stdin.read() or "{}"
    return json.loads(raw)


def main():
    payload = read_input()
    args = payload.get("args") or {}

    print(json.dumps({
        "status": "ok",
        "customerReply": "执行成功",
        "response": {}
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

### 5.2 返回结构建议

建议脚本返回：

```json
{
  "status": "ok",
  "customerReply": "给客户看的回复",
  "response": {
    "raw": "原始数据"
  }
}
```

说明：

- `status`
  - `ok`
  - `need_input`
  - `misconfigured`
  - `upstream_error`
  - `runtime_error`

- `customerReply`
  - 最终要回给客户的话

- `response`
  - 原始结果或结构化结果

### 5.3 缺参数时怎么返回

例如缺运单号：

```python
print(json.dumps({
    "status": "need_input",
    "missingInputs": ["billCodes"],
    "message": "缺少运单号",
    "customerReply": "请把运单号发我，我来帮您查物流轨迹。"
}, ensure_ascii=False))
```

---

## 6. 环境变量怎么维护

### 6.1 推荐方式

不要把密钥直接写死在脚本里。  
应该在技能里的“环境变量”区域维护。

例如：

- `JT_CARGO_API_ACCOUNT`
- `JT_CARGO_PRIVATE_KEY`
- `JT_CARGO_TRACE_URL`

然后脚本里这样读取：

```python
import os

api_account = os.environ.get("JT_CARGO_API_ACCOUNT", "").strip()
private_key = os.environ.get("JT_CARGO_PRIVATE_KEY", "").strip()
trace_url = os.environ.get("JT_CARGO_TRACE_URL", "").strip()
```

### 6.2 必填环境变量校验

推荐这样写：

```python
def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"missing_env:{name}")
    return value
```

然后：

```python
api_account = require_env("JT_CARGO_API_ACCOUNT")
private_key = require_env("JT_CARGO_PRIVATE_KEY")
trace_url = require_env("JT_CARGO_TRACE_URL")
```

### 6.3 不推荐方式

不建议这样写：

```python
PRIVATE_KEY = "xxxxxx"
```

原因：

- 密钥暴露在脚本源码里
- 后续换密钥要改脚本
- 不适合正式环境

---

## 7. J&T 物流轨迹技能示例

### 7.1 Metadata

- 名称：`J&T 物流轨迹查询`
- 编码：`jt_cargo_trace`
- 分类：`logistics`
- 状态：`active`
- 说明：`查询 J&T 运单的完整物流轨迹`

### 7.2 环境变量

- `JT_CARGO_API_ACCOUNT`
- `JT_CARGO_PRIVATE_KEY`
- `JT_CARGO_TRACE_URL`

### 7.3 脚本应完成的事

1. 读取输入
2. 提取运单号
3. 从环境变量读取账号和密钥
4. 组装 `bizContent`
5. 计算 `digest`
6. 发 HTTP 请求
7. 解析完整 `details`
8. 生成完整轨迹回复

### 7.4 正确结果

不是只返回最后一条轨迹，  
而是应返回完整时间线，例如：

- 第 1 条：签收
- 第 2 条：派送中
- 第 3 条：到件
- 第 4 条：发出

---

## 8. 常见错误

### 错误 1：AI 选中了技能，但没有执行

常见原因：

- 脚本报错
- 缺环境变量
- 返回 JSON 格式不对

检查：

- 是否有 `status`
- 是否有 `customerReply`
- 是否输出了合法 JSON

### 错误 2：技能一直要求客户补资料

常见原因：

- `SKILL.md` 写得太窄
- `FORMS.md` 没写清楚参数名
- 脚本对输入识别太死板

### 错误 3：只返回最后一条轨迹

常见原因：

- 脚本代码只取了 `details[0]`

正确做法：

- 遍历完整 `details`
- 生成完整轨迹时间线

### 错误 4：脚本里直接写死密钥

常见原因：

- 临时测试时图省事

正式环境做法：

- 把密钥放到技能环境变量里
- 脚本用 `os.environ.get()` 读取

---

## 9. 推荐维护原则

### 原则 1
`SKILL.md` 负责告诉 AI 什么时候用这个技能。

### 原则 2
脚本负责真正执行动作，不要把执行逻辑全写在说明里。

### 原则 3
密钥、URL、账号放技能环境变量，不要写死在脚本里。

### 原则 4
如果返回的是时间线、明细、列表，不要只回最后一条。

### 原则 5
先让脚本返回结构化结果，再决定怎么生成给客户的话术。

---

## 10. 上线前检查清单

每个技能发布前，至少检查下面这些项：

- [ ] Metadata 已填写完整
- [ ] `SKILL.md` 已写清楚什么时候使用
- [ ] `FORMS.md` 已写清参数规则
- [ ] `REFERENCE.md` 已写清接口说明
- [ ] 脚本能正常运行
- [ ] 脚本返回合法 JSON
- [ ] `customerReply` 已能给客户直接看
- [ ] 技能环境变量已配置完整
- [ ] 密钥没有写死在脚本源码里
- [ ] 实测能成功返回结果

---

## 11. 一句话总结

创建技能时，请记住这套分工：

- `Metadata`：告诉系统这是什么技能
- `SKILL.md`：告诉 AI 什么时候用
- `FORMS.md`：告诉 AI 参数怎么填
- `REFERENCE.md`：提供详细说明
- `Scripts`：真正执行
- `环境变量`：安全信息放这里，不写死在脚本里
