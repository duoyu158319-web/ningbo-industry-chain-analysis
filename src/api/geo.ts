import { apiClient } from './client';

// ────────── 类型定义 ──────────

export interface DistrictItem {
  name: string;
  adcode: string;
  level: string;
  districts: DistrictItem[];
}

export interface GeocodeResult {
  lng: number;
  lat: number;
  district: string;
  formatted_address: string;
}

export interface IsochroneResult {
  polygon: [number, number][];
  center: [number, number];
  travel_time_min: number;
  mode: string;
}

export interface EnterpriseCreatePayload {
  name: string;
  industry_chain: string;
  chain_node: string;
  chain_position: string;
  registered_address?: string;
  location?: string;
  lat?: number;
  lng?: number;
  legal_representative?: string;
  credit_code?: string;
  registered_capital?: number;
  founded_date?: string;
  description?: string;
}

// ────────── API 函数 ──────────

/**
 * 查询行政区域列表（代理高德行政区划接口）
 * @param keywords 关键字，如 '浙江省'、'宁波市'
 * @param subdistrict 向下展开层级数 0=仅本级, 1=含下一级, 2=含两级
 */
export function fetchDistricts(keywords: string, subdistrict = 1) {
  return apiClient<DistrictItem[]>(
    `/geo/districts/?keywords=${encodeURIComponent(keywords)}&subdistrict=${subdistrict}`
  );
}

/**
 * 地址地理编码（Key 保留在后端，前端通过自有接口代理）
 * @param address 地址字符串，如 '宁波市鄞州区中河路55号'
 */
export function geocodeAddress(address: string) {
  return apiClient<GeocodeResult>('/spatial/geocode/', {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

/**
 * 等时圈分析（触发高德路径规划，8 个方向截取边界点构成多边形）
 */
export function fetchIsochrone(params: {
  lng: number;
  lat: number;
  travel_time_min: number;
  mode?: 'driving' | 'walking';
}) {
  return apiClient<IsochroneResult>('/spatial/isochrone/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * 新增企业（提供地址时后端自动地理编码）
 */
export function createEnterprise(payload: EnterpriseCreatePayload) {
  return apiClient<{ id: number; name: string; geo_status: string }>('/enterprises/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
