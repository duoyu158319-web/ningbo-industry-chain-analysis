import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
from core.database import SessionLocal
from models.chain import ChainNodeDefinition

db = SessionLocal()
nodes = db.query(ChainNodeDefinition).filter(
    ChainNodeDefinition.industry_chain == '新能源汽车'
).order_by(ChainNodeDefinition.scale_score.desc()).all()

print(f'共 {len(nodes)} 个节点')
print(f'  {"节点":<30} {"scale":>6} {"tech":>6} {"link":>6} {"加权分":>7} 评级')
print('  ' + '-'*72)
for n in nodes:
    label = f'{n.node_name}/{n.node2_name}' if n.node2_name else n.node_name
    weighted = round(n.scale_score*0.5 + n.linkage_score*0.4 + n.tech_score*0.1, 1)
    print(f'  {label:<30} {n.scale_score:>6.1f} {n.tech_score:>6.1f} {n.linkage_score:>6.1f} {weighted:>7.1f} {n.node_level}')
db.close()
