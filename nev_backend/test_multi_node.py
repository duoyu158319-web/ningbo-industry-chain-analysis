# -*- coding: utf-8 -*-
"""
test_multi_node.py — 测试同层级是否可能出现多个 >50% 候选
"""
import urllib.request, json, sys
sys.stdout.reconfigure(encoding="utf-8")

CASES = [
    {
        "name": "比亚迪股份有限公司（整车+电池双业务）",
        "business_scope": (
            "新能源汽车整车研发、制造、销售；"
            "锂离子电池、磷酸铁锂动力电池、储能电池研发生产销售；"
            "电动汽车充电基础设施建设运营；"
            "汽车电子及驱动电机研发制造"
        ),
        "enterprise_intro": "全球领先的新能源汽车及电池制造商，业务涵盖整车、动力电池、光伏与储能",
    },
    {
        "name": "均胜电子（汽车电子+充电桩）",
        "business_scope": (
            "汽车电子控制系统、智能座舱、新能源汽车电驱系统研发制造；"
            "新能源汽车充电模块、车载充电机设计生产；"
            "功率变换器、OBC车载充电机"
        ),
        "enterprise_intro": "专注汽车智能化与电动化，产品覆盖核心零部件与充电基础设施",
    },
    {
        "name": "华友钴业（锂电材料上下游）",
        "business_scope": (
            "锂电池正极材料前驱体、三元正极材料研发生产；"
            "钴、镍、锂等电池级金属材料精炼；"
            "锂矿资源开采与加工；电池回收及再生材料业务"
        ),
        "enterprise_intro": "新能源电池材料全产业链企业，布局资源端至正极材料端",
    },
    {
        "name": "人为构造：刻意跨环节企业",
        "business_scope": (
            "磷酸铁锂正极材料、碳纳米管导电剂生产；"
            "动力电池PACK组装；"
            "新能源乘用车整车制造；"
            "充电桩设备生产及充电站运营"
        ),
        "enterprise_intro": "假设横跨上中下游全部业务的极端测试案例",
    },
]

URL = "http://127.0.0.1:8001/predict"

def call(case):
    payload = {
        "enterprise_name": case["name"],
        "enterprise_intro": case["enterprise_intro"],
        "business_scope": case["business_scope"],
        "threshold_stage": 0.50,
        "threshold_second": 0.50,
        "threshold_third": 0.50,
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(URL, data=data,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)

print("=" * 70)
print("多节点置信度验证（各层级是否可能同时 >50% 出现多个候选）")
print("=" * 70)

for case in CASES:
    print(f"\n【{case['name']}】")
    try:
        r = call(case)
    except Exception as e:
        print(f"  ❌ 请求失败: {e}")
        continue

    for level_key in ["环节", "二级分类", "三级分类"]:
        lv = r.get(level_key, {})
        scores = r.get("各级分数明细", {}).get(level_key, {})
        candidates = lv.get("candidates", {})
        all_above = {k: v for k, v in scores.items() if v >= 0.5}

        label = lv.get("label") or "(未达阈值)"
        conf = lv.get("confidence", 0.0)
        print(f"  {level_key}: 判定={label} ({conf:.1%})", end="")
        if len(all_above) > 1:
            print(f"  🔴 多个>50%候选: {all_above}")
        elif len(all_above) == 1:
            print(f"  ✅ 唯一>50%候选")
        else:
            print(f"  ⚠️  无>50%候选，分布={dict(sorted(scores.items(), key=lambda x:-x[1]))}")

print("\n" + "=" * 70)
print("数学分析：")
print("  由于各层级分数经 softmax/归一化后总和=1，")
print("  同层级出现两个同时>50%在数学上不可能（A>0.5, B>0.5 => A+B>1 矛盾）")
print("  因此 candidates 永远只有 0 或 1 个 >50% 候选。")
print("=" * 70)
