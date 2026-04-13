import {
  Search, Network, Info, AlertTriangle,
  Check, X, Zap, Loader2,
} from 'lucide-react';
import Layout from '../components/Layout';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchChainGraph, fetchNodeDetail,
  GraphNode, ChainNodeDetail,
} from '../api/chain';

// ─── 配色常量 ───────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  advantage: '#1D9E75',
  potential:  '#BA7517',
  weakness:   '#E24B4A',
  blank:      '#888780',
};
const STATUS_LABEL: Record<string, string> = {
  advantage: '优势节点',
  potential:  '潜力节点',
  weakness:   '薄弱节点',
  blank:      '空白节点',
};
const POSITION_LABEL: Record<string, string> = {
  upstream:   '上游',
  midstream:  '中游',
  downstream: '下游',
};
const POSITION_COLOR: Record<string, string> = {
  upstream:   'bg-primary',
  midstream:  'bg-secondary',
  downstream: 'bg-tertiary',
};

// ─── 自动布局：返回百分比坐标 xPct/yPct，与 SVG 和 div 定位完全一致 ────────────
// NOTE: 三列占用 15-35 / 40-60 / 65-85 区间，与区域色块一致
const COL_CENTER_PCT: Record<string, number> = {
  upstream:   20,   // 左區域中心
  midstream:  50,   // 居中
  downstream: 76,   // 右区域中心（避开右侧面板）
};

function autoLayout(
  nodes: GraphNode[],
): Array<GraphNode & { xPct: number; yPct: number }> {
  // 按链位分组，未知链位归入 midstream
  const groups: Record<string, GraphNode[]> = { upstream: [], midstream: [], downstream: [] };
  nodes.forEach(n => {
    (groups[n.type] ?? groups['midstream']).push(n);
  });

  const result: Array<GraphNode & { xPct: number; yPct: number }> = [];
  for (const [pos, grp] of Object.entries(groups)) {
    const total = grp.length;
    const xPct = COL_CENTER_PCT[pos] ?? 50;
    grp.forEach((node, i) => {
      // NOTE: Y方向在 10%～84% 内均布，保留边距避免标签被截断
      const yPct = total === 1 ? 48 : 10 + (74 / (total - 1)) * i;
      result.push({ ...node, xPct, yPct });
    });
  }
  return result;
}


// ─── 评分进度条子组件 ────────────────────────────────────────
function ScoreBar({ label, value, color = 'bg-primary' }: { label: string; value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-3 text-[10px]">
      <span className="w-16 text-on-surface-variant">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-on-surface-variant font-mono">{pct.toFixed(1)}</span>
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────
const INDUSTRY_OPTIONS = ['新能源汽车', '集成电路', '生物医药', '人工智能', '新材料'];

export default function ChainGraph() {
  const location = useLocation();

  // NOTE: industryChain 改为 state，支持页面内切换，不再只依赖 navigate state
  const [industryChain, setIndustryChain] = useState<string>(
    location.state?.industry || '新能源汽车'
  );

  // 链位过滤（全部 / upstream / midstream / downstream）
  const [positionFilter, setPositionFilter] = useState<string>('');

  // 节点大小依据（宁波企业数 / scale_score / patent / 综合评分）
  const [nodeSizeBasis, setNodeSizeBasis] = useState<string>('宁波企业数量');

  // 图谱数据
  const [graphLoading, setGraphLoading] = useState(true);
  const [rawNodes, setRawNodes]   = useState<GraphNode[]>([]);
  const [rawEdges, setRawEdges]   = useState<{ source: string; target: string }[]>([]);

  // 选中节点详情
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [detail, setDetail]             = useState<ChainNodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 搜索
  const [search, setSearch] = useState('');

  // ── 拉取图谱 ──
  useEffect(() => {
    setGraphLoading(true);
    fetchChainGraph(industryChain)
      .then(data => {
        setRawNodes(data.nodes);
        setRawEdges(data.edges);
      })
      .catch(console.error)
      .finally(() => setGraphLoading(false));
  }, [industryChain]);

  // ── 拉取节点详情（使用 parent_name 即真实 node_name 查询） ──
  useEffect(() => {
    if (!selectedNode) { setDetail(null); return; }
    setDetailLoading(true);
    // NOTE: 后端 detail 接口按 node_name 查询，使用 parent_name（一级节点名）而非数字 id
    const queryName = selectedNode.parent_name || selectedNode.label;
    fetchNodeDetail(queryName, industryChain)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [selectedNode, industryChain]);

  // ── 布局计算 ──
  const layoutNodes = useMemo(() => autoLayout(rawNodes), [rawNodes]);

  // ── 链位 + 搜索过滤 ──
  const filteredNodes = useMemo(() => {
    let nodes = layoutNodes;
    if (positionFilter) nodes = nodes.filter(n => n.type === positionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      nodes = nodes.filter(n => n.label.toLowerCase().includes(q));
    }
    return nodes;
  }, [layoutNodes, positionFilter, search]);

  // ── 节点大小计算函数（依据 nodeSizeBasis 切换） ──
  const getNodeSize = (node: GraphNode & { xPct: number; yPct: number }): number => {
    const MIN = 36, MAX = 76;
    let raw = 0;
    switch (nodeSizeBasis) {
      case '宁波企业数量': raw = node.ningbo_count * 0.15; break;
      case '注册资本均值': raw = node.scale_score * 0.4;   break;
      case '专利总数':   raw = node.tech_score   * 0.4;   break;
      case '综合评分':   raw = ((node.scale_score + node.tech_score + node.linkage_score) / 3) * 0.4; break;
      default:              raw = node.ningbo_count * 0.15;
    }
    return Math.min(MAX, Math.max(MIN, MIN + raw));
  };

  // ── 实时节点评级统计（传给 Sidebar 辨色说明） ──
  const graphStats = useMemo(() => ({
    advantage: rawNodes.filter(n => n.status === 'advantage').map(n => ({
      label: n.label, ningbo_count: n.ningbo_count, scale_score: n.scale_score,
    })),
    potential: rawNodes.filter(n => n.status === 'potential').map(n => ({
      label: n.label, ningbo_count: n.ningbo_count, scale_score: n.scale_score,
    })),
    weakness: rawNodes.filter(n => n.status === 'weakness').map(n => ({
      label: n.label, ningbo_count: n.ningbo_count, scale_score: n.scale_score,
    })),
    blank: rawNodes.filter(n => n.status === 'blank').map(n => ({
      label: n.label, ningbo_count: n.ningbo_count,
    })),
  }), [rawNodes]);

  // ── 链位统计（用于概览面板） ──
  const positionGroups = useMemo(() => {
    const groups: Record<string, GraphNode[]> = {};
    rawNodes.forEach(n => {
      if (!groups[n.type]) groups[n.type] = [];
      groups[n.type].push(n);
    });
    return groups;
  }, [rawNodes]);

  // ── 健康度统计 ──
  const healthStats = useMemo(() => ({
    advantage: rawNodes.filter(n => n.status === 'advantage').length,
    potential:  rawNodes.filter(n => n.status === 'potential').length,
    weakness:   rawNodes.filter(n => n.status === 'weakness').length,
    blank:      rawNodes.filter(n => n.status === 'blank').length,
  }), [rawNodes]);

  // ── 分组框：找出共享同一 parent_name 且有 node2_name 的子节点组，计算包围盒 ──
  const groupBoxes = useMemo(() => {
    const groups: Record<string, Array<GraphNode & { xPct: number; yPct: number }>> = {};
    layoutNodes.forEach(n => {
      if (n.node2_name && n.parent_name) {
        const key = `${n.parent_name}__${n.type}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(n);
      }
    });
    return Object.entries(groups)
      .filter(([, members]) => members.length > 1)
      .map(([key, members]) => {
        const parentName = key.split('__')[0];
        const xPcts = members.map(m => m.xPct);
        const yPcts = members.map(m => m.yPct);
        return {
          parentName,
          xCenter: xPcts.reduce((a, b) => a + b, 0) / xPcts.length,
          yMin: Math.min(...yPcts),
          yMax: Math.max(...yPcts),
        };
      });
  }, [layoutNodes]);



  return (
    <Layout sidebarProps={{
      initialIndustry: industryChain,
      onChainChange: (chain: string) => {
        setIndustryChain(chain);
        setSelectedNode(null);
        setSearch('');
        setPositionFilter('');
      },
      onPositionChange: (pos: string) => {
        // NOTE: Sidebar 传来中文链位，映射到英文 key 用于过滤
        const posMap: Record<string, string> = {
          '上游': 'upstream', '中游': 'midstream', '下游': 'downstream', '全部': '',
        };
        setPositionFilter(posMap[pos] ?? '');
        setSelectedNode(null);
      },
      onNodeSizeBasisChange: (basis: string) => setNodeSizeBasis(basis),
      graphStats,
    }}>
      <div className="relative h-[calc(100vh-200px)] bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-inner">

        {/* ── 流向图主体 ── */}
        <div className="absolute inset-0">
          {graphLoading ? (
            <div className="flex flex-col items-center gap-3 text-on-surface-variant">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-medium">正在加载图谱数据…</p>
            </div>
          ) : (
            <>
              {/* ── 三区域色块背景 + 顶部标签 ── */}
              <div className="absolute inset-0 grid grid-cols-3 pointer-events-none">
                {([
                  { label: '上游 Upstream',   bg: 'rgba(45,219,222,0.04)',  border: 'rgba(45,219,222,0.15)',  text: '#2ddbde' },
                  { label: '中游 Midstream',  bg: 'rgba(120,220,119,0.04)', border: 'rgba(120,220,119,0.15)', text: '#78dc77' },
                  { label: '下游 Downstream', bg: 'rgba(249,171,255,0.04)', border: 'rgba(249,171,255,0.15)', text: '#f9abff' },
                ] as const).map((zone, i) => (
                  <div
                    key={i}
                    className="h-full flex flex-col"
                    style={{
                      background: zone.bg,
                      borderRight: i < 2 ? `1px dashed ${zone.border}` : 'none',
                    }}
                  >
                    {/* 顶部标签栏 */}
                    <div className="flex items-center justify-center py-3 gap-2" style={{ borderBottom: `1px solid ${zone.border}` }}>
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: zone.text }} />
                      <span className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: zone.text }}>
                        {zone.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── SVG：分组框 + 边线 ── */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.25)" />
                  </marker>
                </defs>

                {/* 父节点分组框 */}
                {groupBoxes.map((box, i) => (
                  <g key={i}>
                    <rect
                      x={`${box.xCenter - 11}%`}
                      y={`${box.yMin - 8}%`}
                      width="22%"
                      height={`${box.yMax - box.yMin + 16}%`}
                      rx="12"
                      fill="rgba(120,220,119,0.04)"
                      stroke="rgba(120,220,119,0.4)"
                      strokeWidth="1.2"
                      strokeDasharray="5 3"
                    />
                    <text
                      x={`${box.xCenter}%`}
                      y={`${box.yMin - 4}%`}
                      textAnchor="middle"
                      fill="rgba(120,220,119,0.9)"
                      fontSize="11"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {box.parentName}
                    </text>
                  </g>
                ))}

                {/* 边线 */}
                {rawEdges.map((edge, i) => {
                  const src = layoutNodes.find(n => n.id === edge.source);
                  const tgt = layoutNodes.find(n => n.id === edge.target);
                  if (!src || !tgt) return null;
                  return (
                    <motion.line
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      x1={`${src.xPct}%`}
                      y1={`${src.yPct}%`}
                      x2={`${tgt.xPct}%`}
                      y2={`${tgt.yPct}%`}
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      markerEnd="url(#arrow)"
                    />
                  );
                })}
              </svg>


              {/* ── 节点（百分比居中定位） ── */}
              {filteredNodes.map((node) => {
                const size = getNodeSize(node);
                const color = STATUS_COLOR[node.status] ?? '#888780';
                const isSelected = selectedNode?.id === node.id;
                return (
                  <motion.div
                    key={node.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 180, damping: 22 }}
                    whileHover={{ scale: 1.1 }}
                    onClick={() => setSelectedNode(isSelected ? null : node)}
                    className={cn(
                      'absolute cursor-pointer flex flex-col items-center gap-1 group',
                      isSelected ? 'z-20' : 'z-10',
                    )}
                    style={{
                      // NOTE: 百分比居中定位，与 SVG的百分比坐标完全对齐
                      left: `${node.xPct}%`,
                      top:  `${node.yPct}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {/* 节点圆 */}
                    <div
                      className="rounded-full flex items-center justify-center shadow-xl relative transition-all duration-300"
                      style={{
                        width: size,
                        height: size,
                        border: `${node.status === 'weakness' ? 3 : 2}px ${node.status === 'weakness' ? 'dashed' : 'solid'} ${color}`,
                        background: isSelected ? `${color}22` : 'rgba(30,35,50,0.7)',
                        boxShadow: isSelected ? `0 0 20px ${color}55` : undefined,
                      }}
                    >
                      <Network className="w-5 h-5" style={{ color }} />
                      {/* 评级徽章 */}
                      <div
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow-lg"
                        style={{ background: color }}
                      >
                        {node.status === 'advantage' && <Check className="w-3 h-3 text-white" />}
                        {node.status === 'potential'  && <Zap className="w-3 h-3 text-white" />}
                        {node.status === 'weakness'   && <AlertTriangle className="w-3 h-3 text-white animate-bounce" />}
                        {node.status === 'blank'      && <X className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    {/* 标签 */}
                    <div className="bg-surface-container-low/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-outline-variant/10 shadow group-hover:border-primary/40 transition-colors">
                      <span className="text-[10px] font-bold text-on-surface whitespace-nowrap">{node.label}</span>
                      {node.ningbo_count > 0 && (
                        <span className="ml-1.5 text-[9px] font-mono text-on-surface-variant">{node.ningbo_count}</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </>
          )}
        </div>

        {/* ── 顶部工具栏（左） ── */}
        <div className="absolute top-6 left-6 z-10 flex items-center gap-2">
          <div className="flex bg-surface-bright/60 backdrop-blur-xl border border-outline-variant/20 p-1 rounded-lg shadow-2xl">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold bg-primary text-on-primary shadow-lg shadow-primary/20">
              <Network className="w-3 h-3" />
              {industryChain} · 产业链图谱
            </div>
          </div>
          {/* 搜索框 */}
          <div className="flex items-center gap-2 bg-surface-bright/60 backdrop-blur-xl border border-outline-variant/20 px-3 py-1.5 rounded-lg shadow-2xl">
            <Search className="w-3 h-3 text-on-surface-variant" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索节点…"
              className="bg-transparent text-[10px] text-on-surface placeholder:text-on-surface-variant outline-none w-28"
            />
          </div>
        </div>

        {/* ── 节点评级图例（左下角）—— 使用真实统计数据 ── */}
        <div className="absolute bottom-6 left-6 z-10 p-3 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 rounded-xl shadow-2xl min-w-[140px]">
          <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">评级图例</h4>
          <div className="space-y-1.5">
            {([
              { key: 'advantage', label: '优势节点', count: healthStats.advantage, color: STATUS_COLOR.advantage },
              { key: 'potential', label: '潜力节点', count: healthStats.potential,  color: STATUS_COLOR.potential },
              { key: 'weakness',  label: '薄弱节点', count: healthStats.weakness,   color: STATUS_COLOR.weakness  },
              { key: 'blank',     label: '空白节点', count: healthStats.blank,      color: STATUS_COLOR.blank     },
            ] as const).map(item => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-[10px] text-on-surface-variant font-medium">{item.label}</span>
                </div>
                <span
                  className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                  style={{ color: item.color, background: `${item.color}18` }}
                >
                  {item.count}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/10 flex justify-between text-[9px] text-on-surface-variant/60">
            <span>共 {rawNodes.length} 节点</span>
            <span>圆圈 ∝ 企业数</span>
          </div>
        </div>

        {/* ── 右侧：概览面板（无选中时显示）+ 预警提示（有薄弱节点时） ── */}
        <div className="absolute top-6 right-6 z-10 flex flex-col gap-3">
          <AnimatePresence>
            {!selectedNode && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 p-5 rounded-2xl shadow-2xl w-72"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface mb-0.5">产业链概览</h3>
                    <p className="text-[10px] text-on-surface-variant">{industryChain} · 宁波市</p>
                  </div>
                  <div className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                    {rawNodes.length} 节点
                  </div>
                </div>

                {/* 各链位节点列表（按 parent_name 分组） */}
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto custom-scrollbar">
                  {['upstream', 'midstream', 'downstream'].map(pos => {
                    const grp = positionGroups[pos] ?? [];
                    if (grp.length === 0) return null;

                    // NOTE: 将有 node2_name 的子节点按 parent_name 分组，其余独立展示
                    const parentGroups: Record<string, GraphNode[]> = {};
                    const standalone: GraphNode[] = [];
                    grp.forEach(n => {
                      if (n.parent_name && n.node2_name && n.parent_name !== n.label) {
                        if (!parentGroups[n.parent_name]) parentGroups[n.parent_name] = [];
                        parentGroups[n.parent_name].push(n);
                      } else {
                        standalone.push(n);
                      }
                    });

                    return (
                      <div key={pos} className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant/10">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className={cn('w-1.5 h-1.5 rounded-full', POSITION_COLOR[pos])} />
                            <span className="text-[10px] font-bold text-on-surface">{POSITION_LABEL[pos]}环节</span>
                          </div>
                          <span className="text-[9px] font-mono text-on-surface-variant">{grp.length} 节点</span>
                        </div>
                        <div className="space-y-1">
                          {/* 独立节点 */}
                          {standalone.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {standalone.map(n => (
                                <button
                                  key={n.id}
                                  onClick={() => setSelectedNode(n)}
                                  className={cn(
                                    'px-1.5 py-0.5 rounded text-[9px] transition-colors border',
                                    'bg-surface-container-highest/50 hover:bg-primary/10 hover:text-primary border-transparent hover:border-primary/20',
                                  )}
                                >
                                  {n.label}
                                </button>
                              ))}
                            </div>
                          )}
                          {/* 父节点分组 */}
                          {Object.entries(parentGroups).map(([pName, children]) => (
                            <div key={pName} className="border border-secondary/25 rounded-md p-1.5 bg-secondary/5">
                              <p className="text-[8px] text-secondary font-bold uppercase tracking-wider mb-1">
                                ⬡ {pName}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {children.map(n => (
                                  <button
                                    key={n.id}
                                    onClick={() => setSelectedNode(n)}
                                    className={cn(
                                      'px-1.5 py-0.5 rounded text-[9px] transition-colors border',
                                      'bg-secondary/10 hover:bg-secondary/25 text-secondary border-secondary/20 hover:border-secondary/50',
                                    )}
                                  >
                                    {n.node2_name ?? n.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 节点分布统计 */}
                <div className="pt-3 border-t border-outline-variant/10">
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { key: 'advantage', label: '优势', count: healthStats.advantage, color: '#1D9E75' },
                      { key: 'potential',  label: '潜力', count: healthStats.potential,  color: '#BA7517' },
                      { key: 'weakness',   label: '薄弱', count: healthStats.weakness,   color: '#E24B4A' },
                      { key: 'blank',      label: '空白', count: healthStats.blank,      color: '#888780' },
                    ].map(item => (
                      <div key={item.key} className="text-center p-1.5 bg-surface-container-low rounded border border-outline-variant/5">
                        <p className="text-[11px] font-bold" style={{ color: item.color }}>{item.count}</p>
                        <p className="text-[8px] text-on-surface-variant">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 薄弱预警（选中节点时显示，独立于概览不遮挡） */}
          <AnimatePresence>
            {selectedNode && healthStats.weakness > 0 && (
              <motion.div
                key="alert"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-error/10 border border-error/20 backdrop-blur-xl p-3 rounded-xl shadow-2xl flex items-start gap-2 w-72"
              >
                <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-error">薄弱环节预警</h4>
                  <p className="text-[10px] text-on-surface-variant mt-0.5 leading-relaxed">
                    检测到 {healthStats.weakness} 个薄弱节点，建议优先关注产业缺口，加强招商引资。
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── 右侧详情面板 ── */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="absolute top-0 right-0 h-full w-80 z-20 bg-surface-container/95 backdrop-blur-2xl border-l border-outline-variant/20 shadow-[-10px_0_30px_rgba(0,0,0,0.4)]"
            >
              <div className="p-6 h-full flex flex-col">
                {/* 标题行 */}
                <div className="flex justify-between items-start mb-5">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-on-surface leading-tight">{selectedNode.label}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-on-surface-variant">{POSITION_LABEL[selectedNode.type] ?? selectedNode.type}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: `${STATUS_COLOR[selectedNode.status]}22`, color: STATUS_COLOR[selectedNode.status] }}
                      >
                        {STATUS_LABEL[selectedNode.status]}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-on-surface-variant hover:text-primary transition-colors ml-2">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : detail ? (
                  <div className="flex-1 overflow-y-auto space-y-5 custom-scrollbar pr-1">
                    {/* 核心指标 */}
                    <div className="grid grid-cols-2 gap-2">
                      <Stat label="宁波企业数" value={detail.ningbo_count} />
                      <Stat label="全国数量占比" value={`${detail.count_ratio_pct.toFixed(1)}%`} highlight />
                      <Stat label="宁波专利数" value={detail.ningbo_patents} />
                      <Stat label="全国同节点数" value={detail.national_count} />
                    </div>

                    {/* 综合评分 */}
                    <div className="pt-4 border-t border-outline-variant/10">
                      <h4 className="text-[11px] font-bold text-on-surface mb-3">节点综合评分</h4>
                      <div className="space-y-2.5">
                        <ScoreBar label="规模评分" value={detail.scale_score}   color="bg-primary" />
                        <ScoreBar label="技术评分" value={detail.tech_score}    color="bg-secondary" />
                        <ScoreBar label="关联评分" value={detail.linkage_score} color="bg-tertiary" />
                      </div>
                    </div>

                    {/* 上下游 */}
                    {(detail.upstream_nodes.length > 0 || detail.downstream_nodes.length > 0) && (
                      <div className="pt-4 border-t border-outline-variant/10">
                        <h4 className="text-[11px] font-bold text-on-surface mb-3">上下游衔接</h4>
                        <div className="space-y-1.5 text-[10px]">
                          {detail.upstream_nodes.slice(0, 3).map((n, i) => (
                            <div key={i} className="flex justify-between">
                              <span className="text-on-surface-variant">↑ {n.name}</span>
                              <span className="text-primary font-medium">上游</span>
                            </div>
                          ))}
                          {detail.downstream_nodes.slice(0, 3).map((n, i) => (
                            <div key={i} className="flex justify-between">
                              <span className="text-on-surface-variant">↓ {n.name}</span>
                              <span className="text-secondary font-medium">下游</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 招商建议 */}
                    {detail.suggestion && (
                      <div className="p-3 rounded-r-lg bg-[#FAEEDA]/80 border-l-4 border-[#BA7517] text-[10px] text-[#633806] leading-relaxed">
                        <p className="font-bold mb-1">系统建议</p>
                        {detail.suggestion}
                      </div>
                    )}

                    {/* 代表企业 */}
                    {detail.top_enterprises.length > 0 && (
                      <div className="pt-4 border-t border-outline-variant/10">
                        <h4 className="text-[11px] font-bold text-on-surface mb-3">代表企业（前{detail.top_enterprises.length}家）</h4>
                        <div className="space-y-1.5">
                          {detail.top_enterprises.map((ent, i) => (
                            <div
                              key={i}
                              className="p-2 bg-surface-container-high/50 rounded-lg border border-transparent hover:border-outline-variant/10 transition-all cursor-pointer space-y-1"
                            >
                              {/* 第一行：名称 + 标签 */}
                              <div className="flex items-center gap-1.5">
                                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', ent.is_listed ? 'bg-primary' : 'bg-outline-variant')} />
                                <span className="flex-1 text-[10px] font-medium text-on-surface truncate">{ent.name}</span>
                                {ent.is_listed && (
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#E1F5EE] text-[#0F6E56] shrink-0">上市</span>
                                )}
                              </div>
                              {/* 第二行：三项数据 */}
                              <div className="flex items-center gap-2 pl-3 text-[9px] text-on-surface-variant">
                                <span>{ent.patent_count} 专利</span>
                                {(ent.registered_capital ?? 0) > 0 && (
                                  <span>· 注册资本 {ent.registered_capital! >= 10000
                                    ? `${(ent.registered_capital! / 10000).toFixed(1)}亿`
                                    : `${ent.registered_capital}万`}
                                  </span>
                                )}
                                {(ent.insured_employees ?? 0) > 0 && (
                                  <span>· 参保 {ent.insured_employees}人</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

              </div>
            </motion.div>
          )}
        </AnimatePresence>



      </div>
    </Layout>
  );
}

// ── 通用统计卡片子组件 ──────────────────────────────────────
function Stat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 text-center">
      <p className={cn('text-base font-bold', highlight ? 'text-primary' : 'text-on-surface')}>
        {value}
      </p>
      <p className="text-[9px] text-on-surface-variant font-medium mt-0.5">{label}</p>
    </div>
  );
}
