// src/api/recognitionTask.ts
// 识别任务 CRUD API 封装（使用项目原生 fetch 客户端）

import { apiClient } from './client';

// ────────────── 类型定义 ──────────────

export interface RecognitionTaskCreate {
  enterprise_name: string;
  credit_code?: string;
  enterprise_intro?: string;
  business_scope?: string;
  industry_major?: string;
  patents_json?: string;
  biz_weight?: number;
  ipc_weight?: number;
  threshold?: number;
  ml_stage?: string;
  ml_stage_conf?: number;
  ml_second?: string;
  ml_second_conf?: number;
  ml_third?: string;
  ml_third_conf?: number;
  ml_score_detail?: string;
  ml_models_used?: string;
}

export interface RecognitionTaskDetail {
  id: number;
  enterprise_name: string;
  credit_code?: string;
  enterprise_intro?: string;
  business_scope?: string;
  industry_major?: string;
  ml_stage?: string;
  ml_stage_conf: number;
  ml_second?: string;
  ml_second_conf: number;
  ml_third?: string;
  ml_third_conf: number;
  ml_score_detail?: string;
  ml_models_used?: string;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  confirmed_at?: string;
  enterprise_id?: number;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  lat?: number;
  lng?: number;
  registered_capital?: number;
  paid_in_capital?: number;
  scale?: string;
  industry_category?: string;
  industry_major_filled?: string;
  industry_medium?: string;
  industry_minor?: string;
}

export interface RecognitionTaskConfirm {
  credit_code: string;
  address?: string;
  province?: string;
  city?: string;
  district?: string;
  registered_capital?: number;
  paid_in_capital?: number;
  scale?: string;
  industry_category?: string;
  industry_major_filled?: string;
  industry_medium?: string;
  industry_minor?: string;
  chain_node_override?: string;
}

export interface TaskSummary {
  pending: number;
  confirmed: number;
  rejected: number;
  total: number;
}

export interface GeocodeResult {
  address: string;
  formatted_address?: string;
  lat?: number;
  lng?: number;
  level?: string;
  confidence?: number;
  success: boolean;
}

// ────────────── API 调用 ──────────────

export async function createRecognitionTask(data: RecognitionTaskCreate): Promise<RecognitionTaskDetail> {
  return apiClient<RecognitionTaskDetail>('/recognize/tasks/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listRecognitionTasks(
  status?: 'pending' | 'confirmed' | 'rejected',
  skip = 0,
  limit = 50,
): Promise<RecognitionTaskDetail[]> {
  const params: string[] = [`skip=${skip}`, `limit=${limit}`];
  if (status) params.push(`status=${status}`);
  return apiClient<RecognitionTaskDetail[]>(`/recognize/tasks/?${params.join('&')}`);
}

export async function getTaskSummary(): Promise<TaskSummary> {
  return apiClient<TaskSummary>('/recognize/tasks/summary/');
}

export async function rejectTask(taskId: number): Promise<RecognitionTaskDetail> {
  return apiClient<RecognitionTaskDetail>(`/recognize/tasks/${taskId}/reject`, { method: 'PATCH' });
}

export async function confirmTask(
  taskId: number,
  data: RecognitionTaskConfirm,
): Promise<RecognitionTaskDetail> {
  return apiClient<RecognitionTaskDetail>(`/recognize/tasks/${taskId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function geocodeAddress(address: string, city = '宁波市'): Promise<GeocodeResult> {
  const params = `address=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}`;
  return apiClient<GeocodeResult>(`/recognize/geocode/?${params}`);
}
