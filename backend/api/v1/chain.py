from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from core.database import get_db
from models.chain import ChainNodeDefinition, ChainRelation
from models.enterprise import Enterprise
from schemas.chain import ChainNodePosition, ChainGraphData, NodeStatsBase, ChainGraphEdge, ChainNodeDetail
from schemas.base import ApiResponse

router = APIRouter()

@router.get("/nodes/", response_model=ApiResponse[ChainNodePosition])
def get_chain_nodes(
    industry_chain: str,
    chain_position: str = None,
    db: Session = Depends(get_db)
):
    """
    返回产业链节点定义，用于侧边栏联级选择。

    结构说明：
      * node_name:  一级节点（例如"核心零部件"）
      * node2_name: 二级节点（例如"汽车动力电池"），与企业表 chain_node 字段对应
      * 若 node2_name 为空，则该一级节点本身即为叶子节点，也可作为 chain_node 筛选值

    返回格式：
      {
        "upstream":   [{"label": "汽车动力电池", "value": "汽车动力电池", "parent": "核心零部件"}, ...],
        "midstream":  [...],
        "downstream": [...]
      }
    """
    query = db.query(ChainNodeDefinition).filter(
        ChainNodeDefinition.industry_chain == industry_chain
    )
    if chain_position:
        query = query.filter(ChainNodeDefinition.chain_position == chain_position)

    nodes = query.order_by(
        ChainNodeDefinition.chain_position,
        ChainNodeDefinition.node_name,
        ChainNodeDefinition.node2_name,
    ).all()

    # NOTE: positions_map 以英文 chain_position 为 key，值为节点对象列表
    # 每个节点对象包含 label（显示名）、value（传给 enterprises API 的 chain_node 值）、parent（一级节点名）
    positions_map = {}
    for node in nodes:
        pos = node.chain_position  # 英文：upstream/midstream/downstream

        if pos not in positions_map:
            positions_map[pos] = []

        if node.node2_name:
            # 有二级节点：叶子节点 = node2_name，parent = node_name
            positions_map[pos].append({
                "label":  node.node2_name,
                "value":  node.node2_name,
                "parent": node.node_name,
            })
        else:
            # 无二级节点：一级节点即为叶子节点
            positions_map[pos].append({
                "label":  node.node_name,
                "value":  node.node_name,
                "parent": None,
            })

    # 去重（同一节点可能因有多行 node2_name 而重复）
    for pos in positions_map:
        seen = set()
        deduped = []
        for item in positions_map[pos]:
            if item["value"] not in seen:
                seen.add(item["value"])
                deduped.append(item)
        positions_map[pos] = deduped

    return ApiResponse(data=ChainNodePosition(industry_chain=industry_chain, positions=positions_map))



@router.get("/graph/", response_model=ApiResponse[ChainGraphData])
def get_chain_graph(industry_chain: str, db: Session = Depends(get_db)):
    """图谱数据（全景流向）"""
    nodes_db = db.query(ChainNodeDefinition).filter(ChainNodeDefinition.industry_chain == industry_chain).all()
    relations_db = db.query(ChainRelation).filter(ChainRelation.industry_chain == industry_chain).all()
    
    node_mapper = {
        "优势节点": "advantage",
        "潜力节点": "potential",
        "薄弱节点": "weakness",
        "空白节点": "blank"
    }

    n_results = []
    for n in nodes_db:
        ratio = 0.0
        if n.national_count and n.national_count > 0:
            ratio = round((n.ningbo_count / n.national_count) * 100, 2)

        # NOTE: 有 node2_name 时使用三级命名（如"核心零部件 · 汽车动力电池"），
        #       用数据库主键作唯一 ID 避免同名节点重叠
        node_label = f"{n.node_name} · {n.node2_name}" if n.node2_name else n.node_name

        n_results.append(NodeStatsBase(
            id=str(n.id),                         # 数据库主键，永远唯一
            label=node_label,
            type=n.chain_position,
            status=node_mapper.get(n.node_level, "blank"),
            ningbo_count=n.ningbo_count,
            national_count=n.national_count,
            scale_score=n.scale_score,
            tech_score=n.tech_score,
            linkage_score=n.linkage_score,
            node_level=n.node_level,
            count_ratio_pct=ratio,
            node2_name=n.node2_name,
            parent_name=n.node_name,              # 一级节点名，用于前端分组框
        ))

    # NOTE: edges 的 source/target 仍使用 node_name（ChainRelation 中存的是一级名）
    #       需要将 edge 的端点映射到对应的节点 id（可能一对多）
    name_to_ids: dict = {}
    for node in n_results:
        name = node.parent_name or node.label
        name_to_ids.setdefault(name, []).append(node.id)

    edges = []
    for r in relations_db:
        src_ids = name_to_ids.get(r.from_node, [r.from_node])
        tgt_ids = name_to_ids.get(r.to_node,   [r.to_node])
        # NOTE: 一个父节点对应多个子节点时，取第一个子节点连线（避免边数爆炸）
        edges.append(ChainGraphEdge(source=src_ids[0], target=tgt_ids[0]))

    return ApiResponse(data=ChainGraphData(nodes=n_results, edges=edges))



@router.get("/node-detail/{node_name}/", response_model=ApiResponse[ChainNodeDetail])
def get_node_detail(node_name: str, industry_chain: str, db: Session = Depends(get_db)):
    """节点的详细信息"""
    node = db.query(ChainNodeDefinition).filter(
        ChainNodeDefinition.industry_chain == industry_chain,
        ChainNodeDefinition.node_name == node_name
    ).first()
    
    if not node:
        return ApiResponse(code=404, message="Node not found")
        
    # 上下游
    up = db.query(ChainRelation.from_node).filter(ChainRelation.to_node == node_name).all()
    down = db.query(ChainRelation.to_node).filter(ChainRelation.from_node == node_name).all()
    
    up_list = [{"name": r[0], "status": "未知"} for r in up]
    down_list = [{"name": r[0], "status": "未知"} for r in down]
    
    # ── 代表企业：直接按数据库 representative_score 降序取前5 ──
    # NOTE: representative_score 由 scripts/calc_representative_score.py 预计算写入，
    #       公式：专利35% + 上市30% + 注册资本25% + 参保人数10%（节点内归一化）
    top_ents_objs = (
        db.query(Enterprise)
        .filter(Enterprise.chain_node == node_name)
        .order_by(Enterprise.representative_score.desc())
        .limit(5)
        .all()
    )
    top_ents = [
        {
            "id":                 e.id,
            "name":               e.name,
            "is_listed":          e.is_listed,
            "patent_count":       e.patent_count or 0,
            "registered_capital": e.registered_capital or 0.0,
            "insured_employees":  e.insured_employees or 0,
        }
        for e in top_ents_objs
    ]

    
    ratio = round((node.ningbo_count / node.national_count) * 100, 2) if node.national_count else 0.0

    data = ChainNodeDetail(
        node_name=node.node_name,
        chain_position=node.chain_position,
        node_level=node.node_level,
        ningbo_count=node.ningbo_count,
        national_count=node.national_count,
        count_ratio_pct=ratio,
        ningbo_patents=db.query(
            func.coalesce(func.sum(Enterprise.patent_count), 0)
        ).filter(Enterprise.chain_node == node_name).scalar() or 0,
        tech_self_rate=node.tech_score,
        scale_score=node.scale_score,
        tech_score=node.tech_score,
        linkage_score=node.linkage_score,
        upstream_nodes=up_list,
        downstream_nodes=down_list,
        od_distances={}, # 这里留作空，等待前端调用独立接口或补充
        suggestion=f"当前节点[{node.node_name}]状态为【{node.node_level}】，请关注其上下游配套情况。",
        top_enterprises=top_ents
    )
    
    return ApiResponse(data=data)
