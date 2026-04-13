import { apiClient } from './client';

/** 顶部指标卡 */
export interface TransitionMetrics {
  total_enterprises: number;
  enterprises_with_patents: number;
  avg_transition_index: number;   // representative_score × 100
  leading_enterprises: number;
}

/** 排行榜单条 */
export interface TransitionRankItem {
  rank: number;
  name: string;
  chain_node: string;
  chain_position: string;
  score: number;        // × 100
  patents: number;
  is_listed: boolean;
}

/** IPC技术分布单条 */
export interface PatentDistItem {
  ipc_prefix: string;   // 如 "H01M"
  count: number;
  percentage: number;   // 0~100
}

/** 地图散点 */
export interface TransitionMapPoint {
  id: number;
  name: string;
  lat: number;
  lng: number;
  chain_node: string;
  chain_position: string;
  transition_index: number;  // × 100
}

/** Dashboard 完整响应 */
export interface TransitionDashboardData {
  metrics: TransitionMetrics;
  ranking: TransitionRankItem[];
  patent_distribution: PatentDistItem[];
  map_points: TransitionMapPoint[];
}

/**
 * 拉取转型看板聚合数据
 * @param industryChain 产业链名称（可选，不传则全产业链）
 * @param district 区县名称（可选，不传则全区域）
 */
export function fetchTransitionDashboard(
  industryChain?: string,
  district?: string,
): Promise<TransitionDashboardData> {
  const params = new URLSearchParams();
  if (industryChain) params.set('industry_chain', industryChain);
  if (district && district !== '全部区县') params.set('district', district);
  const qs = params.toString();
  return apiClient<TransitionDashboardData>(`/transition/dashboard/${qs ? `?${qs}` : ''}`);
}
