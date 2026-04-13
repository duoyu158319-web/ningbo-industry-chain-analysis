# -*- coding: utf-8 -*-
"""
test_confidence.py — 验证 nev_api 是否正确输出所有置信度 >= 50% 的候选结果
"""
import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

# 测试案例：宁德时代（典型上游/电池材料企业）
payload = {
    "enterprise_name": "宁德时代新能源科技股份有限公司",
    "industry_major": "制造业/汽车制造业/新能源汽车",
    "enterprise_intro": "专注于锂离子电池开发、制造和销售",
    "business_scope": (
        "锂离子电池、动力电池系统、储能系统的研发、生产和销售；"
        "电池材料、电池管理系统研发；新能源汽车零部件"
    ),
    "patents": [
        {
            "title": "一种三元锂电池正极材料制备方法",
            "abstract": "本发明涉及锂电池正极材料技术，提高能量密度",
            "ipc_codes": ["H01M4/58", "H01M10/0525"],
        },
        {
            "title": "动力电池热管理系统",
            "abstract": "涉及电动车电池温控技术，改善电池寿命",
            "ipc_codes": ["H01M10/613", "B60L58/26"],
        },
    ],
    "threshold_stage": 0.50,
    "threshold_second": 0.50,
    "threshold_third": 0.50,
}

data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(
    "http://127.0.0.1:8001/predict",
    data=data,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.load(resp)
except Exception as e:
    print(f"请求失败: {e}")
    sys.exit(1)

print("=" * 60)
print("NEV 推理输出验证报告")
print("=" * 60)

print(f"\n输入信息源:  {result.get('input_sources')}")
print(f"使用模型:    {result.get('使用模型')}")

LEVELS = [("环节", "stage"), ("二级分类", "second"), ("三级分类", "third")]

for cn_key, _ in LEVELS:
    level = result.get(cn_key, {})
    label = level.get("label")
    conf = level.get("confidence", 0.0)
    low = level.get("low_confidence", True)
    candidates = level.get("candidates", {})

    print(f"\n{'─'*40}")
    print(f"【{cn_key}】")
    print(f"  最终判定: {label or '(未达阈值)'}")
    print(f"  置信度:   {conf:.1%}  {'⚠️ 低置信' if low else '✅ 达到阈值'}")
    if candidates:
        print(f"  所有 >50% 候选项:")
        for lbl, score in sorted(candidates.items(), key=lambda x: -x[1]):
            bar = "█" * int(score * 20)
            print(f"    {lbl:<25} {score:.1%}  {bar}")
    else:
        print("  所有 >50% 候选项: (无)")

print(f"\n{'─'*40}")
print("分数明细（各层级所有标签，降序）")
for level_name, scores in result.get("各级分数明细", {}).items():
    print(f"\n  [{level_name}]")
    for lbl, score in sorted(scores.items(), key=lambda x: -x[1]):
        mark = " ⬅ 超过50%" if score >= 0.5 else ""
        print(f"    {lbl:<25} {score:.1%}{mark}")

print("\n" + "=" * 60)
print("验证结论：candidates 字段应仅含置信度 >= 50% 的标签")
print("=" * 60)
