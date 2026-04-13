// recognize.ts — 智能识别相关 API 函数
import { apiClient } from './client';

// ────── 请求/响应类型 ──────

export interface NevPatentItem {
  title: string;
  abstract?: string;
  ipc_codes?: string[];   // 该专利的 IPC 分类号（如 H01M10/052）
}

export interface NevPredictRequest {
  enterprise_name?: string;
  industry_major?: string;
  industry_large?: string;
  industry_medium?: string;
  industry_minor?: string;
  enterprise_intro?: string;
  business_scope?: string;
  patents?: NevPatentItem[];
  extra_ipc_codes?: string[];   // 额外 IPC 代码（不附于单条专利）
  ipc_weight?: number;          // IPC 叠加权重，默认 0.20
  biz_weight?: number;          // 默认 0.5
  threshold_stage?: number;     // 默认 0.5
  threshold_second?: number;    // 默认 0.5
  threshold_third?: number;     // 默认 0.5
}

export interface NevLevelResult {
  label: string | null;
  confidence: number;
  low_confidence: boolean;
  candidates: Record<string, number>;
}

export interface NevPredictResponse {
  input_sources: string[];
  models_used: string[];
  stage: NevLevelResult;
  second: NevLevelResult;
  third: NevLevelResult;
  score_detail: Record<string, Record<string, number>>;
}

export interface NevHealthResponse {
  online: boolean;
  service: string;
  url: string;
  hint?: string | null;
}

// ────── API 函数 ──────

/**
 * 检查 NEV 推理微服务（nev_api:8001）是否在线
 */
export async function getNevHealth(): Promise<NevHealthResponse> {
  return apiClient<NevHealthResponse>('/recognize/nev-health/');
}

/**
 * 新能源汽车产业链节点识别
 * 企业信息与专利列表均可选，至少提供一方
 */
export async function nevPredict(req: NevPredictRequest): Promise<NevPredictResponse> {
  return apiClient<NevPredictResponse>('/recognize/nev-predict/', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/**
 * 一键启动 nev_api 推理微服务（由主后端以子进程方式拉起）
 * 会轮询等待服务就绪后返回，最多等待 60 秒
 */
export async function nevStart(): Promise<{ started: boolean; message: string }> {
  return apiClient<{ started: boolean; message: string }>('/recognize/nev-start/', {
    method: 'POST',
  });
}
