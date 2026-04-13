import { Enterprise, Metric, ImportActivity } from './types';

export const MOCK_METRICS: Metric[] = [
  { label: '企业总数', value: '12,842', change: '+2.4%', trend: 'up', color: 'primary' },
  { label: '中游节点数', value: '4,215', subtext: '活跃生产单元', color: 'secondary' },
  { label: '数据完整度', value: '99.8%', subtext: '2023年12月审计通过', color: 'tertiary' },
  { label: '最后同步时间', value: '14分钟前', subtext: '实时网关在线', color: 'outline' },
];

export const MOCK_ENTERPRISES: Enterprise[] = [
  {
    id: '9823-AQ-21',
    name: '宁波精达',
    chainSegment: 'midstream',
    revenue: '14.2M',
    dataSource: '自建',
    reliability: 94,
    location: '北仑区',
    status: 'verified',
    description: '专业从事精密冲床、换热器装备和漆包线装备的研发、生产和销售...',
    valuation: '¥42.1亿',
    growthRate: '+12.4%'
  },
  {
    id: '4125-XB-09',
    name: '均胜电子',
    chainSegment: 'midstream',
    revenue: '52.8M',
    dataSource: '企查查',
    reliability: 88,
    location: '鄞州区',
    status: 'pending',
    description: '全球领先的汽车电子与汽车安全供应商，专注于智能座舱、智能驾驶...',
    valuation: '¥280.5亿',
    growthRate: '+8.7%'
  },
  {
    id: '8871-TR-42',
    name: '拓普集团',
    chainSegment: 'midstream',
    revenue: '29.1M',
    dataSource: '企查查',
    reliability: 95,
    location: '北仑区',
    status: 'verified',
    description: '汽车动力底盘系统、内饰隔音系统、智能驾驶控制系统等研发与制造...',
    valuation: '¥650.2亿',
    growthRate: '+15.2%'
  },
  {
    id: '2219-PS-10',
    name: '杉杉股份',
    chainSegment: 'upstream',
    revenue: '8.4M',
    dataSource: '自建',
    reliability: 100,
    location: '鄞州区',
    status: 'verified',
    description: '全球领先的锂离子电池负极材料和偏光片供应商...',
    valuation: '¥450.1亿',
    growthRate: '+10.4%'
  },
];

export const MOCK_ACTIVITIES: ImportActivity[] = [
  { id: '1', name: '年度经济普查数据.xlsx', user: '管理员', time: '2小时前', status: 'success', type: 'file' },
  { id: '2', name: '区县节点遥测数据', user: '定期同步', time: '4小时前', status: 'active', type: 'api' },
];
