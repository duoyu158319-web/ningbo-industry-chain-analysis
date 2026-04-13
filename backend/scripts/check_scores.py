import sys; sys.path.insert(0, '.')
from core.database import SessionLocal
from models.chain import ChainNodeDefinition
db = SessionLocal()
import logging; logging.disable(logging.CRITICAL)

for chain in ['新能源汽车', '生物医药']:
    rows = db.query(ChainNodeDefinition).filter_by(industry_chain=chain).all()
    print(f'=== {chain} ===')
    print(f'  {"节点":<22} {"宁波":>6} {"scale":>7} {"tech":>7} {"link":>7} {"avg":>7} 评级')
    for r in rows:
        label = f'{r.node_name}/{r.node2_name}' if r.node2_name else r.node_name
        avg = (r.scale_score + r.tech_score + r.linkage_score) / 3
        print(f'  {label:<22} {r.ningbo_count:>6} {r.scale_score:>7.1f} {r.tech_score:>7.1f} {r.linkage_score:>7.1f} {avg:>7.1f} {r.node_level}')
    print()

db.close()
