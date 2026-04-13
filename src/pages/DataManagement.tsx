import {
  Search, X, Download, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, CheckCircle2, ArrowRight,
} from 'lucide-react';
import Layout from '../components/Layout';
import { cn } from '../lib/utils';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';



// ────────── 类型定义 ──────────

interface EnterpriseItem {
  id: number;
  name: string;
  industry_chain: string | null;
  chain_node: string | null;
  chain_position: string | null;
  location: string | null;
  scale: string | null;
  association_level: string | null;
  lng: number | null;
  lat: number | null;
  geo_status: string | null;
  legal_representative: string | null;
  founded_date: string | null;
  registered_address: string | null;
  credit_code: string | null;
  registered_capital: number | null;
  patent_count: number | null;
  representative_score: number | null;
}

interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
}

// ────────── API 函数 ──────────

/**
 * 从后端分页查询企业列表，所有过滤参数均由服务端处理
 */
async function fetchEnterprises(params: {
  keyword?: string;
  industry_chain?: string;
  chain_position?: string;
  chain_node?: string;
  sub_node?: string;
  scale?: string;
  location?: string;
  association_level?: string;
  page: number;
  page_size: number;
}): Promise<{ items: EnterpriseItem[]; pagination: PaginationMeta }> {
  const q = new URLSearchParams();
  if (params.keyword)            q.set('keyword', params.keyword);
  if (params.industry_chain)     q.set('industry_chain', params.industry_chain);
  if (params.chain_position)     q.set('chain_position', params.chain_position);
  if (params.chain_node)         q.set('chain_node', params.chain_node);
  if (params.sub_node)           q.set('sub_node', params.sub_node);
  if (params.scale)              q.set('scale', params.scale);
  if (params.location)           q.set('location', params.location);
  if (params.association_level)  q.set('association_level', params.association_level);
  q.set('page', String(params.page));
  q.set('page_size', String(params.page_size));

  // NOTE: 直接 fetch 以便同时读取 data 和 pagination 两个字段
  let res: Response;
  try {
    res = await fetch(`/api/v1/enterprises/?${q.toString()}`);
  } catch {
    throw new Error('后端服务未启动，请先运行后端（端口 8000）');
  }
  const json = await res.json();
  if (!res.ok || json.code !== 200) {
    throw new Error(json.detail || json.message || `请求失败（HTTP ${res.status}）`);
  }
  return {
    items: json.data ?? [],
    pagination: json.pagination ?? { page: 1, page_size: 20, total: 0 },
  };
}

// ────────── 常量 ──────────

const CHAIN_OPTIONS   = ['新能源汽车', '集成电路', '人工智能', '生物医药'];
const SCALE_OPTIONS   = ['大型', '中型', '小微'];
const LEVEL_OPTIONS   = ['强', '较强', '中'];
const POSITION_OPTIONS = [
  { label: '上游', value: '上游' },
  { label: '中游', value: '中游' },
  { label: '下游', value: '下游' },
];
// 产业位置英文→中文显示映射（数据库存储英文，前端展示中文）
const GEO_STATUS_MAP: Record<string, string> = {
  done: '已定位', pending: '待处理', failed: '定位失败',
};

const PAGE_SIZE = 20;
const POSITION_DISPLAY: Record<string, string> = {
  upstream: '上游', midstream: '中游', downstream: '下游',
  '上游': '上游', '中游': '中游', '下游': '下游',
};
// 链节点：含核心零部件三级子节点（分组渲染用）
const NODE_GROUPS = [
  { group: '整车', nodes: [{ label: '新能源汽车整车', value: 'node:新能源汽车整车' }] },
  {
    group: '核心零部件',
    nodes: [
      { label: '核心零部件（全部）', value: 'node:核心零部件' },
      { label: '　├ 汽车动力电池', value: 'sub:汽车动力电池' },
      { label: '　├ 驱动电机', value: 'sub:驱动电机' },
      { label: '　└ 其他零部件', value: 'sub:其他零部件' },
    ],
  },
  { group: '其他节点', nodes: [
    { label: '核心电子元器件', value: 'node:核心电子元器件' },
    { label: '电控系统组件', value: 'node:电控系统组件' },
    { label: '汽车服务', value: 'node:汽车服务' },
    { label: '关键原材料', value: 'node:关键原材料' },
    { label: '待分类', value: 'node:待分类' },
  ]},
];
// 宁波市区县列表（来自数据库实际数据）
const LOCATION_OPTIONS = [
  '鄞州区', '镇海区', '北仑区', '江北区', '海曙区',
  '奉化区', '余姚市', '慈溪市', '宁海县', '象山县',
];


// ────────── 企业数据库主组件 ──────────

function EnterpriseDB() {
  const navigate = useNavigate();
  const [selectedEnterprise, setSelectedEnterprise] = useState<EnterpriseItem | null>(null);

  // 筛选条件
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [chainFilter, setChainFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [scaleFilter, setScaleFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  // 分页
  const [page, setPage] = useState(1);

  // 后端数据
  const [enterprises, setEnterprises] = useState<EnterpriseItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, page_size: PAGE_SIZE, total: 0 });
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // UI 状态
  const [showExportConfirm, setShowExportConfirm] = useState(false);

  // 搜索防抖 400ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setKeyword(val); setPage(1); }, 400);
  };

  // 筛选条件变化 → 重置页码
  useEffect(() => { setPage(1); }, [chainFilter, positionFilter, nodeFilter, scaleFilter, levelFilter, locationFilter]);

  // 从后端拉数据
  // NOTE: nodeFilter 值格式为 "node:核心零部件" 或 "sub:汽车动力电池"，
  //       解析前缀后分别发送给 chain_node 或 sub_node 参数
  const loadData = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      let chainNode: string | undefined;
      let subNode: string | undefined;
      if (nodeFilter) {
        if (nodeFilter.startsWith('sub:')) subNode = nodeFilter.slice(4);
        else if (nodeFilter.startsWith('node:')) chainNode = nodeFilter.slice(5);
        else chainNode = nodeFilter;
      }
      const result = await fetchEnterprises({
        keyword:           keyword        || undefined,
        industry_chain:    chainFilter    || undefined,
        chain_position:    positionFilter || undefined,
        chain_node:        chainNode,
        sub_node:          subNode,
        scale:             scaleFilter    || undefined,
        association_level: levelFilter    || undefined,
        location:          locationFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setEnterprises(result.items);
      setPagination(result.pagination);
    } catch (e: any) {
      setFetchError(e.message || '数据加载失败，请检查后端服务');
    } finally { setLoading(false); }
  }, [keyword, chainFilter, positionFilter, nodeFilter, scaleFilter, levelFilter, locationFilter, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));

  const clearFilters = () => {
    setSearchInput(''); setKeyword('');
    setChainFilter(''); setPositionFilter(''); setNodeFilter('');
    setScaleFilter(''); setLevelFilter(''); setLocationFilter('');
    setPage(1);
  };

  const geoLabel = (s: string | null) => GEO_STATUS_MAP[s ?? ''] ?? s ?? '未知';

  return (
    <div className="space-y-6">
      {/* 引导提示：新增入口 */}
      <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/15 rounded-xl">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-on-surface">新增企业请通过「智能识别」工作台操作</p>
          <p className="text-xs text-on-surface-variant mt-0.5">识别完成后确认信息即可入库，确保数据转型分类准确性。</p>
        </div>
        <button onClick={() => navigate('/recognize')}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all shrink-0">
          前往识别工作台
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── 筛选区 ── */}
      <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 shadow-sm space-y-4">
        {/* 搜索 + 操作按钮 */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
            <input
              value={searchInput}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 transition-all outline-none"
              placeholder="模糊搜索企业名称（400ms 防抖）..."
            />
          </div>
          <div className="flex gap-2 flex-wrap ml-auto">
            <button onClick={() => navigate('/recognize')}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all">
              智能识别
            </button>
            <button onClick={() => setShowExportConfirm(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-high text-on-surface rounded-lg text-sm font-bold border border-outline-variant/10 hover:bg-surface-container-highest transition-all">
              <Download className="w-4 h-4" />导出数据
            </button>
          </div>
        </div>

        {/* 过滤器：6列 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <select value={chainFilter} onChange={e => setChainFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary/30 outline-none">
            <option value="">产业链（全部）</option>
            {CHAIN_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={positionFilter} onChange={e => { setPositionFilter(e.target.value); setNodeFilter(''); }}
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary/30 outline-none">
            <option value="">产业位置（全部）</option>
            {POSITION_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          {/* 链节点 — optgroup 分组，含核心零部件三级子节点 */}
          <select value={nodeFilter} onChange={e => setNodeFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary/30 outline-none">
            <option value="">链节点（全部）</option>
            {NODE_GROUPS.map(g => (
              <optgroup key={g.group} label={`── ${g.group} ──`}>
                {g.nodes.map(n => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          <select value={scaleFilter} onChange={e => setScaleFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary/30 outline-none">
            <option value="">规模（全部）</option>
            {SCALE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary/30 outline-none">
            <option value="">关联强度（全部）</option>
            {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          {/* 区县 — 下拉选择（来自数据库实际区县） */}
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-xs text-on-surface focus:ring-1 focus:ring-primary/30 outline-none">
            <option value="">区县（全部）</option>
            {LOCATION_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-on-surface-variant">
            共 <span className="font-bold text-on-surface">{pagination.total.toLocaleString()}</span> 条记录
            {loading && <Loader2 className="inline w-3 h-3 ml-2 text-primary animate-spin" />}
          </span>
          <button onClick={clearFilters} className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
            <X className="w-3 h-3" />清空筛选
          </button>
        </div>
      </div>

      {/* ── 数据表格 ── */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden shadow-xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm min-w-[1100px]">
            <thead className="bg-surface-container-high text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              <tr>
                <th className="px-5 py-4 sticky left-0 bg-surface-container-high z-10">企业名称</th>
                <th className="px-5 py-4">产业链</th>
                <th className="px-5 py-4">链节点</th>
                <th className="px-5 py-4">产业位置</th>
                <th className="px-5 py-4">区县</th>
                <th className="px-5 py-4">规模</th>
                <th className="px-5 py-4">关联强度</th>
                <th className="px-5 py-4">专利数</th>
                <th className="px-5 py-4">转型得分</th>
                <th className="px-5 py-4">坐标状态</th>
                <th className="px-5 py-4 text-right pr-8">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {/* 骨架屏 */}
              {loading && enterprises.length === 0 && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 11 }).map((__, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-3 bg-surface-container-highest rounded" style={{ width: `${50 + (j * 13) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

              {/* 错误状态 */}
              {!loading && fetchError && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-error">
                    <AlertCircle className="w-5 h-5 inline mr-2" />{fetchError}
                  </td>
                </tr>
              )}

              {/* 空状态 */}
              {!loading && !fetchError && enterprises.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-on-surface-variant italic">
                    未找到匹配的企业数据
                  </td>
                </tr>
              )}

              {/* 数据行 */}
              {enterprises.map((ent, i) => {
                const geoOk = ent.geo_status === 'done';
                const score = ent.representative_score != null
                  ? Math.round(ent.representative_score * 100) : null;
                return (
                  <tr key={ent.id ?? i} className="hover:bg-surface-container-high/50 transition-colors group">
                    <td className="px-5 py-3 font-bold text-on-surface group-hover:text-primary transition-colors sticky left-0 bg-surface-container-low group-hover:bg-surface-container-high/50 z-10 max-w-[200px]">
                      <span className="block truncate" title={ent.name}>{ent.name}</span>
                    </td>
                    <td className="px-5 py-3 text-xs font-bold text-on-surface">{ent.industry_chain ?? '—'}</td>
                    <td className="px-5 py-3 text-[10px] font-medium text-on-surface-variant">{ent.chain_node ?? '—'}</td>
                    <td className="px-5 py-3">
                      {ent.chain_position ? (() => {
                        const zh = POSITION_DISPLAY[ent.chain_position] ?? ent.chain_position;
                        return (
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold",
                            zh === '上游' ? "bg-blue-100 text-blue-700" :
                            zh === '中游' ? "bg-purple-100 text-purple-700" :
                            "bg-orange-100 text-orange-700")}>
                            {zh}
                          </span>
                        );
                      })() : <span className="text-on-surface-variant/40 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[10px] text-on-surface-variant">{ent.location ?? '—'}</td>
                    <td className="px-5 py-3 text-xs text-on-surface-variant">{ent.scale ?? '—'}</td>
                    <td className="px-5 py-3">
                      {ent.association_level ? (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-10 bg-surface-container-highest rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full",
                              ent.association_level === '强' ? "bg-error" :
                              ent.association_level === '较强' ? "bg-orange-500" : "bg-yellow-500")}
                              style={{ width: ent.association_level === '强' ? '100%' : ent.association_level === '较强' ? '70%' : '40%' }} />
                          </div>
                          <span className="text-[10px] font-bold text-on-surface-variant">{ent.association_level}</span>
                        </div>
                      ) : <span className="text-on-surface-variant/40 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[10px] font-mono text-on-surface-variant">{ent.patent_count ?? 0}</td>
                    <td className="px-5 py-3">
                      {score != null ? (
                        <span className={cn("text-xs font-bold tabular-nums",
                          score >= 55 ? "text-[#1D9E75]" :
                          score >= 40 ? "text-[#97C459]" :
                          score >= 30 ? "text-[#EF9F27]" : "text-on-surface-variant")}>
                          {score}
                        </span>
                      ) : <span className="text-on-surface-variant/40 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn("flex items-center gap-1 text-[10px] font-bold",
                        geoOk ? "text-secondary" : "text-on-surface-variant")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                          geoOk ? "bg-secondary" : "bg-outline-variant")} />
                        {geoLabel(ent.geo_status)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right pr-8">
                      <button id={`enterprise-detail-btn-${i}`} onClick={() => setSelectedEnterprise(ent)}
                        className="text-primary hover:underline font-bold text-xs">详情</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 分页导航 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-outline-variant/10 bg-surface-container-lowest/50">
            <span className="text-xs text-on-surface-variant">
              第 <span className="font-bold text-on-surface">{page}</span> / {totalPages} 页 · 每页 {PAGE_SIZE} 条
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-outline-variant/10 hover:bg-surface-container-high disabled:opacity-40 transition-all">首页</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1 rounded border border-outline-variant/10 hover:bg-surface-container-high disabled:opacity-40 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={cn("w-8 h-7 text-xs rounded border transition-all",
                      p === page ? "bg-primary text-on-primary border-primary font-bold" : "border-outline-variant/10 hover:bg-surface-container-high")}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1 rounded border border-outline-variant/10 hover:bg-surface-container-high disabled:opacity-40 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded border border-outline-variant/10 hover:bg-surface-container-high disabled:opacity-40 transition-all">末页</button>
            </div>
          </div>
        )}
      </div>

      {/* ── 详情弹框 ── */}
      {selectedEnterprise && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/10">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
              <h2 className="text-xl font-bold text-on-surface truncate pr-4">{selectedEnterprise.name}</h2>
              <button onClick={() => setSelectedEnterprise(null)} className="p-2 hover:bg-surface-container-high rounded-full transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: '法定代表人', value: selectedEnterprise.legal_representative },
                  { label: '成立日期',   value: selectedEnterprise.founded_date },
                  { label: '企业规模',   value: selectedEnterprise.scale },
                  { label: '关联强度',   value: selectedEnterprise.association_level },
                  { label: '专利数量',   value: selectedEnterprise.patent_count != null ? `${selectedEnterprise.patent_count} 项` : null },
                  { label: '转型得分',   value: selectedEnterprise.representative_score != null ? `${Math.round(selectedEnterprise.representative_score * 100)} 分` : null },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-1">
                    <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">{label}</p>
                    <p className="text-sm font-medium">{value ?? '—'}</p>
                  </div>
                ))}
              </div>

              {selectedEnterprise.registered_address && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">注册地址</p>
                  <p className="text-sm">{selectedEnterprise.registered_address}</p>
                </div>
              )}

              {(selectedEnterprise.lat != null && selectedEnterprise.lng != null) && (
                <div className="flex gap-4 p-3 bg-primary/5 border border-primary/10 rounded-xl">
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest">经度 (Lng)</p>
                    <p className="text-sm font-mono font-bold">{selectedEnterprise.lng.toFixed(6)}</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] font-bold text-primary uppercase tracking-widest">纬度 (Lat)</p>
                    <p className="text-sm font-mono font-bold">{selectedEnterprise.lat.toFixed(6)}</p>
                  </div>
                  <div className="flex items-center">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-secondary">
                      <CheckCircle2 className="w-3.5 h-3.5" />已定位
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-outline-variant/5">
                <div className="flex gap-3">
                  <div className="flex-1 p-3 bg-surface-container-low rounded-xl border border-outline-variant/5">
                    <p className="text-[10px] font-bold text-primary mb-1">产业链归属</p>
                    <p className="text-sm font-bold">{selectedEnterprise.industry_chain ?? '—'}</p>
                  </div>
                  <div className="flex-1 p-3 bg-surface-container-low rounded-xl border border-outline-variant/5">
                    <p className="text-[10px] font-bold text-secondary mb-1">核心节点</p>
                    <p className="text-sm font-bold">{selectedEnterprise.chain_node ?? '—'} ({selectedEnterprise.chain_position ?? '—'})</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 bg-surface-container-low border-t border-outline-variant/10 flex justify-end">
              <button onClick={() => setSelectedEnterprise(null)}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold shadow-lg shadow-primary/20">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 导出确认弹框 ── */}
      {showExportConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/10">
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                <Download className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-on-surface">确认导出数据？</h3>
              <p className="text-sm text-on-surface-variant">
                当前筛选条件共 <span className="font-bold text-on-surface">{pagination.total.toLocaleString()}</span> 条企业数据，将导出为 .xlsx。
              </p>
            </div>
            <div className="p-6 bg-surface-container-low border-t border-outline-variant/10 flex gap-3">
              <button onClick={() => setShowExportConfirm(false)}
                className="flex-1 py-2.5 bg-surface-container-highest text-on-surface rounded-lg text-sm font-bold border border-outline-variant/10 hover:bg-surface-container-high transition-all">取消</button>
              <button onClick={() => { setShowExportConfirm(false); alert('数据导出任务已提交。'); }}
                className="flex-1 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all">确认导出</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataManagement() {
  return (
    <Layout showSidebar={false}>
      <div className="h-full">
        <div className="mb-6">
          <h2 className="text-2xl font-headline font-bold text-on-surface">企业数据库</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            实时查询 · 服务端过滤与分页 · 宁波产业链企业全量数据
          </p>
        </div>
        <EnterpriseDB />
      </div>
    </Layout>
  );
}
