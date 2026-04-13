// 这是对原生 fetch 的简单封装，用来与 FastAPI /api/v1 交互
const BASE_URL = '/api/v1';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const config: RequestInit = {
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch {
    // NOTE: fetch 直接抛错说明后端完全不可达（未启动或网络故障）
    throw new Error('后端服务未启动，请先运行主后端（端口 8000）');
  }

  const data = await response.json();
  
  if (!response.ok || data.code !== 200) {
    throw new Error(data.detail || data.message || `请求失败（HTTP ${response.status}）`);
  }

  return data.data as T;
}
