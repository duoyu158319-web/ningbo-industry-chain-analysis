import { apiClient } from './client';

/** 单个叶子节点定义 */
export interface ChainNodeItem {
  label: string;           // 显示名称（用于 UI 渲染）
  value: string;           // chain_node 值（传给地图过滤 API）
  parent: string | null;   // 所属一级节点，无二级时为 null
}

/** /chain/nodes/ 接口返回结构 */
export interface ChainNodePosition {
  industry_chain: string;
  positions: Record<string, ChainNodeItem[]>;  // key = upstream/midstream/downstream
}

/** 图谱单节点 */
export interface GraphNode {
  id: string;
  label: string;
  type: string;              // upstream / midstream / downstream
  status: string;            // advantage / potential / weakness / blank
  ningbo_count: number;
  national_count: number;
  scale_score: number;
  tech_score: number;
  linkage_score: number;
  node_level: string;        // 优势节点 / 潜力节点 / 薄弱节点 / 空白节点
  count_ratio_pct: number;
  /** 二级子节点名（如"汽车动力电池"），中文点分三级命名时使用 */
  node2_name?: string | null;
  /** 一级节点名（如"核心零部件"），用于前端分组框 */
  parent_name?: string | null;
}

/** 图谱边 */
export interface GraphEdge {
  source: string;
  target: string;
}

/** /chain/graph/ 接口返回结构 */
export interface ChainGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** 上下游节点简要信息 */
export interface RelatedNode {
  name: string;
  status: string;
}

/** 代表企业 */
export interface TopEnterprise {
  id: number;
  name: string;
  is_listed: boolean | null;
  patent_count: number;
  registered_capital?: number;  // 注册资本（万元）
  insured_employees?: number;   // 参保人数
}

/** /chain/node-detail/ 接口返回结构 */
export interface ChainNodeDetail {
  node_name: string;
  chain_position: string;
  node_level: string;
  ningbo_count: number;
  national_count: number;
  count_ratio_pct: number;
  ningbo_patents: number;
  tech_self_rate: number;
  scale_score: number;
  tech_score: number;
  linkage_score: number;
  upstream_nodes: RelatedNode[];
  downstream_nodes: RelatedNode[];
  suggestion: string;
  top_enterprises: TopEnterprise[];
}

/**
 * 从 chain_node_definition 表获取产业链节点列表
 * @param industryChain 产业链名称
 * @param chainPosition 可选：过滤的链位（upstream/midstream/downstream）
 */
export function fetchChainNodes(
  industryChain: string,
  chainPosition?: string,
): Promise<ChainNodePosition> {
  const params = new URLSearchParams({ industry_chain: industryChain });
  if (chainPosition) params.set('chain_position', chainPosition);
  return apiClient<ChainNodePosition>(`/chain/nodes/?${params.toString()}`);
}

/**
 * 获取产业链图谱数据（节点 + 边）
 * 对应 backend /chain/graph/?industry_chain=xxx
 */
export function fetchChainGraph(industryChain: string): Promise<ChainGraphData> {
  const params = new URLSearchParams({ industry_chain: industryChain });
  return apiClient<ChainGraphData>(`/chain/graph/?${params.toString()}`);
}

/**
 * 获取单个节点详情
 * 对应 backend /chain/node-detail/{node_name}/?industry_chain=xxx
 */
export function fetchNodeDetail(
  nodeName: string,
  industryChain: string,
): Promise<ChainNodeDetail> {
  const params = new URLSearchParams({ industry_chain: industryChain });
  return apiClient<ChainNodeDetail>(
    `/chain/node-detail/${encodeURIComponent(nodeName)}/?${params.toString()}`,
  );
}
