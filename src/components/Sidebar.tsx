import { Database, Network, ChevronRight, Filter, Search, Zap, Flame, MapPin, BarChart3, Link2, Check, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useLocation } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { fetchChainNodes, ChainNodeItem } from '../api/chain';


const POSITION_TO_EN: Record<string, string> = {
  '全部': '',
  '上游': 'upstream',
  '中游': 'midstream',
  '下游': 'downstream',
};

const DISTRICT_OPTIONS = [
  '宁波市',
  '鄄州区', '北仑区', '江北区', '海曙区', '镇海区', '奔化区',
  '慈溪市', '余姚市', '宁海县', '象山县',
];

export default function Sidebar(props: any) {
  const location = useLocation();
  const isMapPage = location.pathname === '/map';
  const isChainPage = location.pathname === '/chain';
  const isTransitionPage = location.pathname === '/transition';

  const [localActiveTool, setLocalActiveTool] = useState<string | null>(null);
  const [localBufferRadius, setLocalBufferRadius] = useState(20);
  const [localIsochroneTime, setLocalIsochroneTime] = useState('30min');

  const activeTool = props.activeTool !== undefined ? props.activeTool : localActiveTool;
  const setActiveTool = props.setActiveTool || setLocalActiveTool;
  const bufferRadius = props.bufferRadius !== undefined ? props.bufferRadius : localBufferRadius;
  const setBufferRadius = props.setBufferRadius || setLocalBufferRadius;
  const isochroneTime = props.isochroneTime !== undefined ? props.isochroneTime : localIsochroneTime;
  const setIsochroneTime = props.setIsochroneTime || setLocalIsochroneTime;
  const selectedEnterprise = props.selectedEnterprise;

  const [selectedIndustry, setSelectedIndustry] = useState(
    props.initialIndustry || '新能源汽车'
  );
  const [selectedChainPosition, setSelectedChainPosition] = useState('全部');
  const [selectedRegion, setSelectedRegion] = useState('宁波市');
  const [selectedScale, setSelectedScale] = useState('全部');
  const [selectedCorrelation, setSelectedCorrelation] = useState('全部');
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [chainViewMode, setChainViewMode] = useState('产业链全景 + 企业网络');
  const [chainNodeSizeBasis, setChainNodeSizeBasis] = useState('宁波企业数量');

  // NOTE: 动态节点列表，key = 链位英文，value = 节点对象列表
  const [allNodes, setAllNodes] = useState<Record<string, ChainNodeItem[]>>({});
  const [nodesLoading, setNodesLoading] = useState(false);

  /**
   * NOTE: 将最新筛选状态通知父组件，由父组件触发地图数据刷新
   */
  const notifyFilter = (
    industry: string,
    pos: string,
    nodes: string[],
    region: string,
    scale: string,
    corr: string,
  ) => {
    const filter = {
      industry_chain: industry,
      chain_position: POSITION_TO_EN[pos] || '',
      chain_nodes: nodes.length > 0 ? nodes.join(',') : '',
      location: region,
      // NOTE: 「小微」对应数据库中的「小型」和「微型」
      scale_list: scale === '全部' ? '' : scale === '小微' ? '小型,微型' : scale,
      association_level: corr,
    };
    if (typeof props.onFilterChange !== 'function') return;
    props.onFilterChange(filter);
  };

  useEffect(() => {
    const industry = props.initialIndustry || selectedIndustry;
    const pos = props.initialPosition || selectedChainPosition;
    const nodes = props.initialNode ? [props.initialNode] : selectedNodes;
    if (props.initialIndustry) setSelectedIndustry(industry);
    if (props.initialPosition) setSelectedChainPosition(pos);
    if (props.initialNode) setSelectedNodes(nodes);
    notifyFilter(industry, pos, nodes, selectedRegion, selectedScale, selectedCorrelation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialIndustry, props.initialPosition, props.initialNode]);

  // NOTE: 切换产业链时从后端动态拉取 chain_node_definition 节点列表
  useEffect(() => {
    setNodesLoading(true);
    setAllNodes({});
    fetchChainNodes(selectedIndustry)
      .then(data => setAllNodes(data.positions))
      .catch(() => setAllNodes({}))
      .finally(() => setNodesLoading(false));
  }, [selectedIndustry]);

  const industryOptions = ['新能源汽车', '集成电路', '生物医药', '人工智能', '新材料'];

  const getChainPositions = () => ['全部', '上游', '中游', '下游'];

  // NOTE: POSITION_TO_EN 的逆映射，用于从中文链位获取英文 key 去索引 allNodes
  const POS_ZH_TO_EN: Record<string, string> = {
    '上游': 'upstream', '中游': 'midstream', '下游': 'downstream',
  };

  /**
   * 根据当前选中的链位过滤节点列表
   * 全部：合并所有链位节点；指定链位：仅返回该链位节点
   */
  const currentNodeOptions = useMemo((): ChainNodeItem[] => {
    if (selectedChainPosition === '全部') {
      return Object.values(allNodes).flat();
    }
    const enKey = POS_ZH_TO_EN[selectedChainPosition];
    return allNodes[enKey] || [];
  }, [allNodes, selectedChainPosition]);

  const filteredNodeOptions = useMemo((): ChainNodeItem[] => {
    if (!nodeSearchQuery.trim()) return currentNodeOptions;
    const q = nodeSearchQuery.toLowerCase();
    return currentNodeOptions.filter(
      item => item.label.toLowerCase().includes(q)
        || (item.parent || '').toLowerCase().includes(q)
    );
  }, [currentNodeOptions, nodeSearchQuery]);

  const toggleScale = (scale: string) => {
    if (scale === '全部') {
      setSelectedScale(['全部']);
      return;
    }
    setSelectedScale(prev => {
      const filtered = prev.filter(s => s !== '全部');
      return filtered.includes(scale) 
        ? (filtered.length === 1 ? ['全部'] : filtered.filter(s => s !== scale))
        : [...filtered, scale];
    });
  };

  const tools = [
    { id: 'buffer', name: '缓冲区分析', icon: Search, color: 'text-primary' },
    { id: 'isochrone', name: '等时圈分析', icon: Zap, color: 'text-secondary' },
    { id: 'od', name: 'OD 矩阵分析', icon: Database, color: 'text-tertiary' },
    { id: 'moran', name: '空间自相关 (Moran\'s I)', icon: Filter, color: 'text-secondary' },
  ];

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-72 bg-slate-900/90 backdrop-blur-2xl flex flex-col py-4 gap-2 shadow-2xl border-r border-outline-variant/5 z-40 overflow-y-auto custom-scrollbar">

      <nav className="flex flex-col gap-1 px-3">
        {/* Industry Chain Selector (Shared) */}
        <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
          <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 font-bold">当前激活产业链</label>
          <select 
            value={selectedIndustry}
            onChange={(e) => {
              const newIndustry = e.target.value;
              setSelectedIndustry(newIndustry);
              setSelectedChainPosition('全部');
              setSelectedNodes([]);
              // NOTE: 图谱页通过 onChainChange 通知 ChainGraph 切换；地图页通过 notifyFilter
              if (typeof props.onChainChange === 'function') {
                props.onChainChange(newIndustry);
              } else {
                notifyFilter(newIndustry, '全部', [], selectedRegion, selectedScale, selectedCorrelation);
              }
            }}
            className="w-full bg-surface-container-lowest border-none text-primary text-sm rounded-lg focus:ring-1 focus:ring-primary py-1.5 px-2 cursor-pointer"
          >
            {industryOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        {isChainPage ? (
          <>
            {/* Chain Position Selector (Shared Logic) */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-3 font-bold">链位选择</label>
              <div className="grid grid-cols-2 gap-2">
                {getChainPositions().map((pos) => (
                  <button
                    key={pos}
                    onClick={() => {
                      setSelectedChainPosition(pos);
                      setSelectedNodes([]);
                      // NOTE: 图谱页通知 onPositionChange；地图页通知 notifyFilter
                      if (typeof props.onPositionChange === 'function') {
                        props.onPositionChange(pos);
                      } else {
                        notifyFilter(selectedIndustry, pos, [], selectedRegion, selectedScale, selectedCorrelation);
                      }
                    }}
                    className={cn(
                      "px-2 py-1.5 rounded text-[10px] font-bold transition-all border",
                      selectedChainPosition === pos 
                        ? "bg-primary text-on-primary border-primary shadow-lg shadow-primary/20" 
                        : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/10 hover:border-primary/30"
                    )}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Node Size Basis */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 font-bold">节点大小依据</label>
              <select 
                value={chainNodeSizeBasis}
                onChange={(e) => {
                  setChainNodeSizeBasis(e.target.value);
                  // NOTE: 向 ChainGraph 回传节点大小依据
                  if (typeof props.onNodeSizeBasisChange === 'function') {
                    props.onNodeSizeBasisChange(e.target.value);
                  }
                }}
                className="w-full bg-surface-container-lowest border-none text-on-surface text-xs rounded-lg focus:ring-1 focus:ring-primary py-1.5 px-2 cursor-pointer"
              >
                {['宁波企业数量', '注册资本均值', '专利总数', '综合评分'].map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Node Rating Explanation —— 使用真实数据 */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-3 font-bold">节点评级说明</label>
              {(() => {
                const gs = props.graphStats;
                if (!gs || (gs.advantage.length + gs.potential.length + gs.weakness.length + gs.blank.length) === 0) {
                  return <p className="text-[10px] text-on-surface-variant/50 text-center py-2">加载中…</p>;
                }
                const sections = [
                  { label: '优势节点', nodes: gs.advantage, bg: '#E1F5EE', headerText: '#085041', dot: '#1D9E75' },
                  { label: '潜力节点', nodes: gs.potential, bg: '#FAEEDA', headerText: '#633806', dot: '#BA7517' },
                  { label: '薄弱节点', nodes: gs.weakness,  bg: '#FCEBEB', headerText: '#791F1F', dot: '#E24B4A' },
                  { label: '空白节点', nodes: gs.blank,     bg: '#F3F3F2', headerText: '#444440', dot: '#888780' },
                ];
                return sections.filter(s => s.nodes.length > 0).map(s => (
                  <div key={s.label} className="mb-2 rounded-lg overflow-hidden border border-outline-variant/10">
                    <div className="px-3 py-2 flex items-center justify-between font-bold text-[10px]"
                      style={{ background: s.bg, color: s.headerText }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                        {s.label}
                      </div>
                      <span className="opacity-70">{s.nodes.length}个</span>
                    </div>
                    <div className="p-2 bg-surface-container-lowest space-y-1">
                      {s.nodes.map(n => (
                        <div key={n.label} className="flex items-center justify-between text-[10px] border-b border-outline-variant/5 last:border-0 pb-1 last:pb-0">
                          <span className="text-on-surface truncate max-w-[110px]">{n.label}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: `${s.dot}18`, color: s.dot }}>
                            {n.ningbo_count}家
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </>
        ) : !isTransitionPage ? (
          <>
            {/* Chain Position Selector */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-3 font-bold">链位选择</label>
            <div className="grid grid-cols-2 gap-2">
                {getChainPositions().map((pos) => (
                  <button
                    key={pos}
                    onClick={() => {
                      setSelectedChainPosition(pos);
                      setSelectedNodes([]);
                      notifyFilter(selectedIndustry, pos, [], selectedRegion, selectedScale, selectedCorrelation);
                    }}
                    className={cn(
                      "px-2 py-1.5 rounded text-[10px] font-bold transition-all border",
                      selectedChainPosition === pos 
                        ? "bg-primary text-on-primary border-primary shadow-lg shadow-primary/20" 
                        : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/10 hover:border-primary/30"
                    )}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Node Multi-Selector (Cascaded) */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">节点选择 (多选)</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-primary font-bold">{selectedNodes.length} 已选</span>
                  {selectedNodes.length > 0 && (
                    <button 
                      onClick={() => setSelectedNodes([])}
                      className="text-[10px] text-error hover:text-error/80 font-bold transition-colors"
                    >
                      全部取消
                    </button>
                  )}
                </div>
              </div>
              
              {/* Node Search */}
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant/50" />
                <input 
                  type="text"
                  placeholder="搜索节点..."
                  value={nodeSearchQuery}
                  onChange={(e) => setNodeSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-lg py-1 pl-7 pr-2 text-[10px] focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                />
              </div>

              <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                {nodesLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    <span className="text-[10px] text-on-surface-variant">加载节点...</span>
                  </div>
                ) : filteredNodeOptions.length === 0 ? (
                  <p className="text-[10px] text-on-surface-variant/50 text-center py-4">
                    {Object.keys(allNodes).length === 0 ? '未找到相关节点' : '暂无此链位节点'}
                  </p>
                ) : (
                  filteredNodeOptions.map((item) => (
                    <button
                      key={item.value}
                      title={item.parent ? `所属：${item.parent}` : undefined}
                      onClick={() => {
                        const newNodes = selectedNodes.includes(item.value)
                          ? selectedNodes.filter(n => n !== item.value)
                          : [...selectedNodes, item.value];
                        setSelectedNodes(newNodes);
                        notifyFilter(selectedIndustry, selectedChainPosition, newNodes, selectedRegion, selectedScale, selectedCorrelation);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 rounded text-[10px] transition-all border",
                        selectedNodes.includes(item.value)
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-surface-container-lowest text-on-surface-variant border-transparent hover:border-outline-variant/20"
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.parent && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-outline-variant/20 text-on-surface-variant/60 font-normal">
                            {item.parent}
                          </span>
                        )}
                        {selectedNodes.includes(item.value) && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>


            {/* Region Selector */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-3 h-3 text-primary" />
                <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">地区范围</label>
              </div>
              <select 
                value={selectedRegion}
                onChange={(e) => {
                  const newRegion = e.target.value;
                  setSelectedRegion(newRegion);
                  notifyFilter(selectedIndustry, selectedChainPosition, selectedNodes, newRegion, selectedScale, selectedCorrelation);
                }}
                className="w-full bg-surface-container-lowest border-none text-on-surface text-xs rounded-lg focus:ring-1 focus:ring-primary py-1.5 px-2 cursor-pointer"
              >
                {DISTRICT_OPTIONS.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>

            {/* Scale Selector */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-3 h-3 text-secondary" />
                <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">企业规模</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {['全部', '大型', '中型', '小微'].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => {
                      setSelectedScale(scale);
                      notifyFilter(selectedIndustry, selectedChainPosition, selectedNodes, selectedRegion, scale, selectedCorrelation);
                    }}
                    className={cn(
                      "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                      selectedScale === scale
                        ? "bg-secondary text-on-secondary border-secondary shadow-md shadow-secondary/20"
                        : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/10 hover:border-secondary/30"
                    )}
                  >
                    {scale}
                  </button>
                ))}
              </div>
            </div>

            {/* Correlation Selector */}
            <div className="px-4 py-3 mb-2 bg-surface-container-low/50 rounded-xl border border-outline-variant/10">
              <div className="flex items-center gap-2 mb-3">
                <Link2 className="w-3 h-3 text-tertiary" />
                <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">关联强度</label>
              </div>
              <div className="flex gap-1 bg-surface-container-lowest p-1 rounded-lg border border-outline-variant/10">
                {['全部', '强', '较强', '中'].map((level) => (
                  <button
                    key={level}
                    onClick={() => {
                      setSelectedCorrelation(level);
                      notifyFilter(selectedIndustry, selectedChainPosition, selectedNodes, selectedRegion, selectedScale, level);
                    }}
                    className={cn(
                      "flex-1 py-1 rounded text-[10px] font-bold transition-all",
                      selectedCorrelation === level
                        ? "bg-tertiary text-on-tertiary shadow-sm"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-50">
              转型看板模式 · 侧边栏筛选已简化
            </p>
          </div>
        )}
      </nav>
      {isMapPage && (
        <div className="mt-6 px-6 py-4 border-t border-outline-variant/10">
          <h3 className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-4 font-bold">空间分析工具</h3>
          <div className="space-y-2">
            {tools.map((tool) => {
              const isDisabled = (tool.id === 'buffer' || tool.id === 'isochrone') && !selectedEnterprise;
              
              return (
                <div key={tool.id} className="space-y-2">
                  <button 
                    disabled={isDisabled}
                    onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs transition-all group relative",
                      activeTool === tool.id ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-container-low text-on-surface hover:bg-surface-container-high",
                      isDisabled && "opacity-40 grayscale cursor-not-allowed"
                    )}
                  >
                    <tool.icon className={cn("w-3 h-3 group-hover:scale-110 transition-transform", tool.color)} />
                    {tool.name}
                    {isDisabled && (
                      <span className="absolute right-2 text-[8px] bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface-variant font-bold">需点选企业</span>
                    )}
                  </button>

                  {activeTool === tool.id && !isDisabled && (
                    <div className="px-4 py-3 bg-surface-container-lowest/50 rounded-lg border border-outline-variant/5 animate-in fade-in slide-in-from-top-1 duration-200">
                    {tool.id === 'buffer' && (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1 mb-1">
                          <span className="text-[9px] text-on-surface-variant/70">分析中心</span>
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/5 rounded border border-primary/10">
                            <MapPin className="w-2.5 h-2.5 text-primary" />
                            <span className="text-[10px] text-on-surface font-bold truncate">{selectedEnterprise?.name}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-on-surface-variant font-bold">半径: {bufferRadius}km</span>
                        </div>
                        <input 
                          type="range" 
                          min="5" 
                          max="50" 
                          value={bufferRadius}
                          onChange={(e) => setBufferRadius(parseInt(e.target.value))}
                          className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between text-[8px] text-on-surface-variant font-mono">
                          <span>5km</span>
                          <span>50km</span>
                        </div>
                      </div>
                    )}

                    {tool.id === 'isochrone' && (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-1 mb-1">
                          <span className="text-[9px] text-on-surface-variant/70">分析中心</span>
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-secondary/5 rounded border border-secondary/10">
                            <MapPin className="w-2.5 h-2.5 text-secondary" />
                            <span className="text-[10px] text-on-surface font-bold truncate">{selectedEnterprise?.name}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                        {['15min', '30min', '45min', '1h'].map((time) => (
                          <button
                            key={time}
                            onClick={() => setIsochroneTime(time)}
                            className={cn(
                              "px-2 py-1.5 rounded text-[10px] font-bold transition-all",
                              isochroneTime === time ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                            )}
                          >
                            {time}
                          </button>
                        ))}
                        </div>
                      </div>
                    )}

                    {tool.id === 'od' && (
                      <div className="space-y-3">
                        <p className="text-[10px] text-on-surface-variant font-bold">节点间平均距离 (km)</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px] border-separate border-spacing-1">
                            <thead>
                              <tr>
                                <th className="p-1"></th>
                                <th className="p-1 text-on-surface-variant font-bold">电芯</th>
                                <th className="p-1 text-on-surface-variant font-bold">PACK</th>
                                <th className="p-1 text-on-surface-variant font-bold">整车</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-1 text-on-surface-variant font-bold">正极材料</td>
                                <td className="p-1 text-center bg-green-500/10 text-green-400 rounded">18</td>
                                <td className="p-1 text-center bg-orange-500/10 text-orange-400 rounded">34</td>
                                <td className="p-1 text-center bg-red-500/10 text-red-400 rounded">87</td>
                              </tr>
                              <tr>
                                <td className="p-1 text-on-surface-variant font-bold">负极材料</td>
                                <td className="p-1 text-center bg-orange-500/10 text-orange-400 rounded">42</td>
                                <td className="p-1 text-center bg-orange-500/10 text-orange-400 rounded">39</td>
                                <td className="p-1 text-center bg-red-500/10 text-red-400 rounded">94</td>
                              </tr>
                              <tr>
                                <td className="p-1 text-on-surface-variant font-bold">BMS</td>
                                <td className="p-1 text-center bg-green-500/10 text-green-400 rounded">22</td>
                                <td className="p-1 text-center bg-green-500/10 text-green-400 rounded">15</td>
                                <td className="p-1 text-center bg-orange-500/10 text-orange-400 rounded">51</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="text-[9px] text-on-surface-variant/70 leading-tight">
                          <span className="text-green-400">绿</span>&lt;30km <span className="text-orange-400">橙</span>30-60km <span className="text-red-400">红</span>&gt;60km
                        </p>
                      </div>
                    )}

                    {tool.id === 'moran' && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-on-surface-variant font-bold">Moran's I 指数 (正极材料)</p>
                        <p className="text-2xl font-bold text-primary">0.431</p>
                        <p className="text-[10px] text-on-surface-variant">
                          p &lt; 0.01 · <span className="text-primary font-bold">显著正相关</span>
                        </p>
                        <p className="text-[10px] text-on-surface-variant font-medium">企业存在显著空间集聚</p>
                      </div>
                    )}

                    {['hotspot', 'nni'].includes(tool.id) && (
                      <div className="flex items-center gap-2 text-[10px] text-on-surface-variant italic">
                        <div className="w-1 h-1 rounded-full bg-primary animate-pulse"></div>
                        正在计算空间特征...
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

    </aside>
  );
}
