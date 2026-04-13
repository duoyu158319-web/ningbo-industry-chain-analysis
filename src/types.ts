export interface Enterprise {
  id: string;
  name: string;
  chainSegment: 'upstream' | 'midstream' | 'downstream';
  revenue: string;
  dataSource: string;
  reliability: number;
  location: string;
  status?: 'new' | 'pending' | 'verified' | 'anomaly';
  description?: string;
  valuation?: string;
  growthRate?: string;
}

export interface Metric {
  label: string;
  value: string;
  change?: string;
  subtext?: string;
  trend?: 'up' | 'down';
  color: 'primary' | 'secondary' | 'tertiary' | 'outline';
}

export interface ImportActivity {
  id: string;
  name: string;
  user: string;
  time: string;
  status: 'success' | 'active' | 'failed';
  type: 'file' | 'api';
}
