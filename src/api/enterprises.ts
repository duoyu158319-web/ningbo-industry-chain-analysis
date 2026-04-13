import { apiClient } from './client';

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  chain_position: string;
  association_level: string;
}

/** 企业详情，对应后端 EnterpriseDetailSchema */
export interface EnterpriseDetail {
  id: number;
  name: string;
  // 产业链归属
  industry_chain?: string;
  chain_node?: string;
  chain_position?: string;
  sub_node?: string;
  // 关联评分
  association_level?: string;
  association_score?: number;
  coverage_score?: number;
  patent_similarity_score?: number;
  scale_percentile?: number;
  patent_count?: number;
  is_listed?: boolean;
  scale?: string;
  // 工商信息
  credit_code?: string;
  registered_capital?: number;
  paid_in_capital?: number;
  founded_date?: string;
  reg_status?: string;
  legal_representative?: string;
  org_type?: string;
  insured_employees?: number;
  reg_authority?: string;
  registered_address?: string;
  business_scope?: string;
  description?: string;
  location?: string;
  // 地理信息
  lat?: number;
  lng?: number;
  geo_status?: string;
}

/** 单条专利，对应后端 PatentDetail */
export interface PatentDetail {
  id: number;
  enterprise_id?: number;
  title: string;
  abstract?: string;
  ipc_codes?: string;
  patent_type: string;
  pub_date?: string;
  applicant?: string;
  source: string;
}

/** 地图散点查询参数 */
export interface MapPointFilter {
  industry_chain?: string;
  chain_position?: string;    // upstream / midstream / downstream
  chain_nodes?: string;       // 逗号分隔，如 "核心零部件,汽车服务"
  location?: string;          // 区县，如 "鄞州区"
  scale_list?: string;        // 逗号分隔，如 "大型,中型"
  association_level?: string; // 强 / 较强 / 中
}

export function fetchMapPoints(filter: MapPointFilter = {}) {
  const params = new URLSearchParams();
  if (filter.industry_chain) params.set('industry_chain', filter.industry_chain);
  if (filter.chain_position && filter.chain_position !== '全部' && filter.chain_position !== 'all') {
    params.set('chain_position', filter.chain_position);
  }
  if (filter.chain_nodes) params.set('chain_nodes', filter.chain_nodes);
  if (filter.location && filter.location !== '宁波市' && filter.location !== '全部') {
    params.set('location', filter.location);
  }
  if (filter.scale_list && filter.scale_list !== '全部') params.set('scale_list', filter.scale_list);
  if (filter.association_level && filter.association_level !== '全部') {
    params.set('association_level', filter.association_level);
  }
  const qs = params.toString();
  return apiClient<MapPoint[]>(`/enterprises/map-points/${qs ? `?${qs}` : ''}`);
}

export function fetchEnterpriseDetail(id: string | number) {
  return apiClient<EnterpriseDetail>(`/enterprises/${id}/`);
}

/**
 * 获取指定企业的专利列表（最多取 pageSize 条，默认 20）
 * @param enterpriseId 企业 ID
 * @param pageSize 每页数量
 */
export function fetchEnterprisePatents(enterpriseId: number, pageSize = 20) {
  return apiClient<PatentDetail[]>(
    `/patents/?enterprise_id=${enterpriseId}&page_size=${pageSize}`
  );
}
