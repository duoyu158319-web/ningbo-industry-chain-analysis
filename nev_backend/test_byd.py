# -*- coding: utf-8 -*-
import urllib.request, json, sys
sys.stdout.reconfigure(encoding="utf-8")

payload = {
    "enterprise_name": "比亚迪股份有限公司",
    "enterprise_intro": "新能源汽车及电池制造商，业务涵盖整车、动力电池",
    "business_scope": "新能源汽车整车研发制造销售；锂离子电池磷酸铁锂动力电池研发生产销售；电动汽车充电基础设施建设",
    "threshold_stage": 0.30,
    "threshold_second": 0.30,
    "threshold_third": 0.30,
}
data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request("http://127.0.0.1:8001/predict", data=data,
    headers={"Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=30) as resp:
    r = json.load(resp)

print("【环节分数明细（threshold=30%）】")
for k, v in sorted(r["各级分数明细"]["环节"].items(), key=lambda x: -x[1]):
    mark = "  << 进入 candidates" if v >= 0.3 else ""
    print(f"  {k}: {v:.1%}{mark}")

print(f"\n环节 candidates: {r['环节']['candidates']}")
print(f"环节 判定: {r['环节']['label']}  置信度: {r['环节']['confidence']:.1%}")

print("\n【二级分类分数明细】")
for k, v in sorted(r["各级分数明细"].get("二级分类", {}).items(), key=lambda x: -x[1]):
    mark = "  << >30%" if v >= 0.3 else ""
    print(f"  {k}: {v:.1%}{mark}")
