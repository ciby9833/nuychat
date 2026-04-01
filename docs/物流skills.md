# 基本信息
能力名称
物流轨迹查询
编码
jt_cargo_trace
分类
general
状态
active
说明
当用户查询 J&T Cargo（JT Express）运单的物流状态、当前位置、轨迹详情、是否签收、预计送达时间等信息时，使用本能力。通过调用 JT Cargo 官方物流轨迹查询接口，返回运单的最新扫描记录和状态，帮助客服快速、准确回复用户。


# SKILL.md
# JT Cargo 物流轨迹查询

## 这个能力做什么
通过 JT Cargo 官方接口查询运单的实时物流轨迹和当前状态，支持单个或多个运单查询（最多30个）。

## 什么时候使用
- 用户询问“我的快递到哪了”“运单状态”“签收了没”“物流跟踪”等
- 用户提供 J&T Cargo（JT Express）的运单号（billCode）
- 用户询问物流进度、所在位置、下一站、是否异常等

## 什么时候不要使用
- 用户查询的不是 J&T Cargo 的运单
- 用户只提供快递公司名称，没有运单号
- 查询其他快递公司（如 JNE、SiCepat、Pos Indonesia 等）

## 需要什么输入
- `billCodes`（必填）：用户提供的运单号，支持多个运单号用英文逗号分隔
- `customer_language`（选填）：客户语言代码，`id` = 印尼语（默认），`zh` = 中文。LLM 根据对话语言自动填写。
- 系统已配置好的 apiAccount、privateKey（用于签名）

## 返回什么结果
- 当前最新状态摘要（status terkini）+ 最近3条轨迹记录
- 输出语言由 `customer_language` 决定（默认印尼语）
- 完整轨迹数组（`details[]`）仍在 JSON 输出中供座席查阅
- 如有问题件会特别提示

## 异常如何处理
- 如果运单号不存在或无效：友好告知用户“运单号可能有误，请确认后重新查询”
- 如果接口返回错误（code ≠ 0）：提示用户“查询失败，请稍后重试或检查运单号”
- 如果签名失败（digest 错误）：记录日志并提示“系统暂时无法查询，请联系技术处理”
- 如果返回轨迹为空：告知用户“暂无轨迹信息，可能刚下单，请稍后再查”

## 使用流程
1. 提取用户消息中的运单号
2. 构造 bizContent（{"billCodes": "JT1234567890"}）
3. 计算 digest 签名（base64(md5(bizContent + privateKey))）
4. 组装 Headers（apiAccount、digest、timestamp）
5. 调用接口 https://openapi.jtcargo.co.id/webopenplatformapi/api/logistics/trace
6. 解析 details 数组，按时间倒序展示最新轨迹
7. 用自然语言清晰回复用户当前状态和关键信息



# Scripts
脚本
脚本名称
JT Cargo 物流轨迹脚本
脚本键
cargo_trace
文件名
cargo_trace.py
语言
python
启用
脚本内容
import sys
import json
import os
import time
import base64
import hashlib
import urllib.request
import urllib.parse
import urllib.error


def read_input():
    raw = sys.stdin.read() or '{}'
    return json.loads(raw)


def extract_bill_codes(args):
    for key in ['billCodes', 'trackingNumber', 'waybillNumber']:
        value = args.get(key)
        if not isinstance(value, str) or not value.strip():
            continue
        raw = value.strip()
        parts = [part.strip() for part in raw.split(',') if part.strip()]
        if not parts:
            continue
        if all(part.isdigit() and 8 <= len(part) <= 20 for part in parts):
            return ','.join(parts)
    return ''


def normalize_details(parsed):
    if not isinstance(parsed, dict):
        return []
    data = parsed.get('data')
    if not isinstance(data, list) or not data:
        return []
    first = data[0]
    if not isinstance(first, dict):
        return []
    details = first.get('details')
    if not isinstance(details, list):
        return []
    rows = []
    for item in details:
        if not isinstance(item, dict):
            continue
        rows.append({
            'scanTime': item.get('scanTime') or '',
            'scanType': item.get('scanType') or '',
            'desc': item.get('desc') or '',
            'network': item.get('scanNetworkName') or '',
            'staff': item.get('staffName') or '',
            'problemType': item.get('problemType') or '',
            'raw': item,
        })
    return rows


def build_customer_reply(parsed, bill_codes):
    if not isinstance(parsed, dict):
        return f'已查询单号 {bill_codes}，但返回结果格式异常。'
    details = normalize_details(parsed)
    if details:
        lines = [f'单号 {bill_codes} 的完整物流轨迹如下：']
        for idx, item in enumerate(details, start=1):
            parts = [
                f"{idx}. 时间：{item['scanTime'] or '未知'}",
                f"状态：{item['scanType'] or '未知'}",
            ]
            if item['desc']:
                parts.append(f"说明：{item['desc']}")
            if item['network']:
                parts.append(f"网点：{item['network']}")
            if item['staff']:
                parts.append(f"业务员：{item['staff']}")
            if item['problemType']:
                parts.append(f"问题编码：{item['problemType']}")
            lines.append('；'.join(parts))
        return '\n'.join(lines)
    msg = parsed.get('msg') if isinstance(parsed.get('msg'), str) else '暂未查到更多轨迹信息。'
    return f'已查询单号 {bill_codes}，接口返回：{msg}'


def main():
    payload = read_input()
    args = payload.get('args') or {}
    bill_codes = extract_bill_codes(args)
    if not bill_codes:
        print(json.dumps({
            'status': 'need_input',
            'missingInputs': ['billCodes'],
            'message': '缺少运单号，无法查询物流轨迹。',
            'customerReply': '请把运单号发我，我来帮您查物流轨迹。'
        }, ensure_ascii=False))
        return

    api_account = os.environ.get('JT_CARGO_API_ACCOUNT', '').strip()
    private_key = os.environ.get('JT_CARGO_PRIVATE_KEY', '').strip()
    trace_url = os.environ.get('JT_CARGO_TRACE_URL', '').strip() or 'https://openapi.jtcargo.co.id/webopenplatformapi/api/logistics/trace'

    if not api_account or not private_key:
        print(json.dumps({
            'status': 'misconfigured',
            'message': 'JT Cargo 凭证未配置。',
            'customerReply': '系统暂时无法查询物流轨迹，请稍后再试。'
        }, ensure_ascii=False))
        return

    biz_content = json.dumps({'billCodes': bill_codes}, ensure_ascii=False, separators=(',', ':'))
    digest = base64.b64encode(hashlib.md5((biz_content + private_key).encode('utf-8')).digest()).decode('utf-8')
    timestamp = str(int(time.time() * 1000))
    body = urllib.parse.urlencode({'bizContent': biz_content}).encode('utf-8')

    request = urllib.request.Request(
        trace_url,
        data=body,
        method='POST',
        headers={
            'Content-Type': 'application/x-www-form-urlencoded',
            'apiAccount': api_account,
            'timestamp': timestamp,
            'digest': digest
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw_body = response.read().decode('utf-8', errors='replace')
            parsed = json.loads(raw_body)
            result = {
                'status': 'ok',
                'provider': 'jt_cargo',
                'billCodes': bill_codes,
                'httpStatus': getattr(response, 'status', 200),
                'request': {
                    'timestamp': timestamp,
                    'digest': digest,
                    'traceUrl': trace_url,
                    'bizContent': json.loads(biz_content)
                },
                'details': normalize_details(parsed),
                'response': parsed,
                'customerReply': build_customer_reply(parsed, bill_codes)
            }
            print(json.dumps(result, ensure_ascii=False))
    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', errors='replace') if hasattr(error, 'read') else ''
        print(json.dumps({
            'status': 'upstream_error',
            'provider': 'jt_cargo',
            'billCodes': bill_codes,
            'httpStatus': getattr(error, 'code', None),
            'request': {
                'timestamp': timestamp,
                'digest': digest,
                'traceUrl': trace_url,
                'bizContent': json.loads(biz_content)
            },
            'responseText': body,
            'customerReply': f'我刚查了单号 {bill_codes}，但物流接口暂时返回异常，请稍后再试。'
        }, ensure_ascii=False))
    except Exception as error:
        print(json.dumps({
            'status': 'runtime_error',
            'provider': 'jt_cargo',
            'billCodes': bill_codes,
            'message': str(error),
            'request': {
                'timestamp': timestamp,
                'digest': digest,
                'traceUrl': trace_url,
                'bizContent': json.loads(biz_content)
            },
            'customerReply': f'我刚尝试查询单号 {bill_codes}，但系统暂时处理失败，请稍后再试。'
        }, ensure_ascii=False))


if __name__ == '__main__':
    main()
