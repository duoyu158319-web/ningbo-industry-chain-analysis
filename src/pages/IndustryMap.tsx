import {
  ScatterChart, Flame, BarChart3, Network,
  Plus, Minus, X, Loader2, FileText, Building2,
} from 'lucide-react';
import Layout from '../components/Layout';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  fetchMapPoints, fetchEnterpriseDetail, fetchEnterprisePatents,
  MapPoint, MapPointFilter, EnterpriseDetail, PatentDetail,
} from '../api/enterprises';
import { fetchIsochrone } from '../api/geo';
import AMapComponent, { AMapComponentRef } from '../components/AMapComponent';

/** 链位英文 → 中文 */
const POSITION_LABEL: Record<string, string> = {
  upstream: '上游',
  midstream: '中游',
  downstream: '下游',
};

/** 链位 → 样式 */
const POSITION_STYLE: Record<string, string> = {
  upstream: 'bg-primary/10 text-primary',
  midstream: 'bg-secondary/10 text-secondary',
  downstream: 'bg-tertiary/10 text-tertiary',
};

/** 注册资本万元 → 可读字符串 */
function formatCapital(val?: number | null): string {
  if (val == null || val === 0) return '未知';
  if (val >= 10000) return `${(val / 10000).toFixed(1)} 亿元`;
  return `${val.toLocaleString()} 万元`;
}

export default function IndustryMap() {
  const location = useLocation();
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [selectedEnterprise, setSelectedEnterprise] = useState<EnterpriseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [patents, setPatents] = useState<PatentDetail[]>([]);
  const [patentsLoading, setPatentsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'scatter' | 'heat' | 'coldhot' | 'odflow'>('scatter');
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  // 热力图参数（固定青翠色板）
  const [heatRadius, setHeatRadius] = useState(35);

  // NOTE: 地图全局筛选状态——初始值直接从 navigate state 构建，避免 Sidebar useEffect 时序问题
  const POSITION_TO_EN: Record<string, string> = {
    '上游': 'upstream', '中游': 'midstream', '下游': 'downstream',
  };
  const [mapFilter, setMapFilter] = useState<MapPointFilter>(() => {
    const st = location.state as { industry?: string; position?: string; node?: string } | null;
    return {
      industry_chain: st?.industry || '新能源汽车',
      chain_position: POSITION_TO_EN[st?.position || ''] || '',
      chain_nodes:    st?.node || '',
    };
  });

  // 筛选变化时重新拉取地图散点
  useEffect(() => {
    fetchMapPoints(mapFilter).then(setMapPoints).catch(console.error);
  }, [mapFilter]);

  /**
   * Sidebar 筛选回调：接收新的筛选参数并触发地图数据刷新
   * NOTE: 使用函数式更新避免闭包陷阱；deep compare 由依赖 mapFilter 对象引用变化驱动
   */
  const handleFilterChange = (newFilter: MapPointFilter) => {
    setMapFilter(prev => {
      // 简单浅比较，只在有实际变化时才触发 setState 避免多余渲染
      const isSame = JSON.stringify(prev) === JSON.stringify(newFilter);
      return isSame ? prev : newFilter;
    });
  };

  // 空间分析工具状态
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [bufferRadius, setBufferRadius] = useState(30);
  const [isochroneTime, setIsochroneTime] = useState('30min');
  const [isochroneLoading, setIsochroneLoading] = useState(false);
  // NOTE: 保存等时圈返回的多边形，用于计算圈内企业数量
  const [isochronePolygon, setIsochronePolygon] = useState<[number, number][]>([]);

  const mapRef = useRef<AMapComponentRef>(null);

  // NOTE: 等时圈触发：工具切换到等时圈且已选中坐标有效的企业时，调用高德路径规划
  useEffect(() => {
    if (activeTool !== 'isochrone' || !selectedEnterprise?.lng || !selectedEnterprise?.lat) return;

    const timeMap: Record<string, number> = { '15min': 15, '30min': 30, '45min': 45, '1h': 60 };
    const travelTimeMin = timeMap[isochroneTime] ?? 30;

    setIsochroneLoading(true);
    fetchIsochrone({
      lng: selectedEnterprise.lng,
      lat: selectedEnterprise.lat,
      travel_time_min: travelTimeMin,
      mode: 'driving',
    })
      .then((res) => {
        if (res?.polygon?.length) {
          const poly = res.polygon as [number, number][];
          setIsochronePolygon(poly);
          if (mapRef.current) mapRef.current.showIsochrone(poly);
        }
      })
      .catch((err) => console.error('[Isochrone]', err))
      .finally(() => setIsochroneLoading(false));
  }, [activeTool, isochroneTime, selectedEnterprise]);

  // NOTE: 缓冲区触发：工具切换到缓冲区或半径变化时，在地图上画虚线圆
  useEffect(() => {
    if (activeTool !== 'buffer' || !selectedEnterprise?.lng || !selectedEnterprise?.lat) return;
    mapRef.current?.showBuffer(
      [selectedEnterprise.lng, selectedEnterprise.lat],
      bufferRadius,
    );
  }, [activeTool, bufferRadius, selectedEnterprise]);

  // NOTE: 取消工具选中时清除地图上所有覆盖物（圆/等时圈多边形），回归原始散点状态
  useEffect(() => {
    if (activeTool === null) {
      mapRef.current?.clearOverlays();
      setIsochronePolygon([]);
    }
  }, [activeTool]);

  /**
   * Haversine 公式计算两点地球距离（km）
   * NOTE: 用于缓冲区内企业筛选
   */
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Ray-casting 算法判断点是否在多边形内
   * poly 中每个元素为 [lng, lat]
   */
  function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]; // lng, lat
      const [xj, yj] = poly[j];
      const intersect =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * 实时计算区域内各链位企业数量
   * - buffer 模式：根据 Haversine 距离过滤
   * - isochrone 模式：根据 Ray-casting 点在多边形内过滤
   */
  const areaStats = useMemo(() => {
    if (!selectedEnterprise?.lat || !selectedEnterprise?.lng) return null;

    let filtered: typeof mapPoints = [];
    if (activeTool === 'buffer') {
      filtered = mapPoints.filter(
        p => haversineKm(selectedEnterprise.lat!, selectedEnterprise.lng!, p.lat, p.lng) <= bufferRadius
      );
    } else if (activeTool === 'isochrone' && isochronePolygon.length > 0) {
      filtered = mapPoints.filter(p => pointInPolygon(p.lat, p.lng, isochronePolygon));
    } else {
      return null;
    }

    return {
      upstream:   filtered.filter(p => p.chain_position === 'upstream').length,
      midstream:  filtered.filter(p => p.chain_position === 'midstream').length,
      downstream: filtered.filter(p => p.chain_position === 'downstream').length,
      total:      filtered.length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, bufferRadius, isochronePolygon, mapPoints, selectedEnterprise]);


  /**
   * 点选地图标记 → 拉取企业详情 + 专利列表
   */
  const handleEnterpriseSelect = async (entId: string | number) => {
    setDetailLoading(true);
    setPatents([]);
    try {
      const detail = await fetchEnterpriseDetail(entId);
      setSelectedEnterprise(detail);
      // NOTE: 并行拉取专利列表，失败不影响主面板展示
      if (detail?.id) {
        setPatentsLoading(true);
        fetchEnterprisePatents(detail.id, 10)
          .then(setPatents)
          .catch((err) => console.warn('[Patents]', err))
          .finally(() => setPatentsLoading(false));
      }
    } catch (err) {
      console.error('[EnterpriseDetail]', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // 关联等级 → 标签样式
  const levelStyle = (level?: string) => {
    if (level === '强') return 'bg-primary/10 text-primary';
    if (level === '较强') return 'bg-secondary/10 text-secondary';
    return 'bg-outline-variant/20 text-on-surface-variant';
  };

  const ent = selectedEnterprise;

  return (
    <Layout
      sidebarProps={{
        activeTool,
        setActiveTool,
        bufferRadius,
        setBufferRadius,
        isochroneTime,
        setIsochroneTime,
        selectedEnterprise,
        initialIndustry: location.state?.industry,
        initialPosition: location.state?.position,
        initialNode: location.state?.node,
        // NOTE: 筛选回调注入，Sidebar 每次筛选变化都会调用此函数
        onFilterChange: handleFilterChange,
      }}
    >
      <div className="relative h-[calc(100vh-200px)] bg-surface-container-lowest rounded-2xl overflow-hidden border border-outline-variant/10 shadow-inner">
        {/* 高德地图主体 */}
        <div className="absolute inset-0 z-0">
          <AMapComponent
            ref={mapRef}
            mapPoints={mapPoints}
            viewMode={viewMode}
            activeTool={activeTool}
            bufferRadius={bufferRadius}
            selectedEnterprise={selectedEnterprise}
            onSelectEnterprise={(point: MapPoint) => handleEnterpriseSelect(point.id)}
            heatRadius={heatRadius}
            heatGradient="cyan"
          />
        </div>

        {/* 地图模式切换工具栏（左上） */}
        <div className="absolute top-6 left-6 z-10 flex bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 p-1 rounded-lg shadow-xl">
          {[
            { id: 'scatter', name: '散点图', icon: ScatterChart },
            { id: 'heat',    name: '热力图', icon: Flame },
            { id: 'coldhot', name: '冷热点图', icon: BarChart3 },
            { id: 'odflow',  name: 'OD流向图', icon: Network },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id as any)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all',
                viewMode === mode.id
                  ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high',
              )}
            >
              <mode.icon className="w-3 h-3" />
              {mode.name}
            </button>
          ))}
        </div>

        {/* 热力图参数控制面板（工具栏直接下方，仅热力图模式显示） */}
        {viewMode === 'heat' && (
          <div className="absolute top-16 left-6 z-10 flex flex-col gap-2 p-4 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 rounded-xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-bold">扩散半径</p>
            <div className="flex gap-1.5">
              {([
                { label: '紧凑', value: 18 },
                { label: '标准', value: 35 },
                { label: '宽松', value: 55 },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setHeatRadius(opt.value)}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all border',
                    heatRadius === opt.value
                      ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20'
                      : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/10 hover:border-primary/30'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 地图缩放控件（右上） */}
        <div className="absolute top-6 right-6 z-10 flex flex-col gap-1">
          <button className="w-10 h-10 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 rounded-t-lg flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-colors">
            <Plus className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 border-t-0 flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-colors">
            <Minus className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 border-t-0 flex items-center justify-center text-[10px] font-bold text-on-surface hover:bg-surface-container-highest transition-colors">
            定位
          </button>
          <button className="w-10 h-10 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 border-t-0 rounded-b-lg flex items-center justify-center text-[10px] font-bold text-on-surface hover:bg-surface-container-highest transition-colors">
            截图
          </button>
        </div>

        {/* ───── 右侧企业详情面板 ───── */}
        <AnimatePresence>
          {(detailLoading || ent) && (
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              className="absolute top-0 right-0 h-full w-80 z-20 bg-surface-container/95 backdrop-blur-2xl border-l border-outline-variant/20 shadow-[-10px_0_30px_rgba(0,0,0,0.4)]"
            >
              {/* 加载骨架 */}
              {detailLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs font-medium">正在加载企业详情…</p>
                </div>
              ) : ent ? (
                <div className="p-5 h-full flex flex-col overflow-y-auto custom-scrollbar">

                  {/* ── 企业名称 + 关闭 ── */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-on-surface leading-tight">{ent.name}</h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {ent.chain_node && (
                          <span className="text-[10px] text-on-surface-variant font-medium">{ent.chain_node}</span>
                        )}
                        {ent.chain_position && (
                          <span className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold', POSITION_STYLE[ent.chain_position] ?? 'bg-outline-variant/20 text-on-surface-variant')}>
                            {POSITION_LABEL[ent.chain_position] ?? ent.chain_position}
                          </span>
                        )}
                        {ent.scale && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-outline-variant/20 text-on-surface-variant font-bold">
                            {ent.scale}型企业
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedEnterprise(null)}
                      className="text-on-surface-variant hover:text-primary transition-colors ml-2"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* ── 核心指标卡片 ── */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 text-center">
                      <p className="text-base font-bold text-on-surface truncate">{formatCapital(ent.registered_capital)}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">注册资本</p>
                    </div>
                    <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 text-center">
                      <p className="text-base font-bold text-on-surface">{ent.patent_count ?? 0}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">专利数量</p>
                    </div>
                    <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 text-center">
                      <p className="text-base font-bold text-on-surface">{ent.insured_employees ?? '-'}</p>
                      <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">参保人数</p>
                    </div>
                    <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 text-center">
                      <p className="text-base font-bold text-on-surface">
                        {ent.founded_date ? ent.founded_date.split('-')[0] : '-'}
                      </p>
                      <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">成立年份</p>
                    </div>
                  </div>

                  {/* ── 产业关联性 ── */}
                  <div className="mb-6 pt-4 border-t border-outline-variant/10">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-on-surface">产业关联性</h4>
                      {ent.association_level && (
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', levelStyle(ent.association_level))}>
                          {ent.association_level}
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {/* 上下游覆盖 */}
                      <ScoreBar
                        label="上下游覆盖"
                        value={ent.coverage_score ?? 0}
                        max={100}
                      />
                      {/* 专利相似度 */}
                      <ScoreBar
                        label="专利相似度"
                        value={ent.patent_similarity_score ?? 0}
                        max={100}
                      />
                      {/* 规模分位 */}
                      <ScoreBar
                        label="规模分位"
                        value={ent.scale_percentile ?? 0}
                        max={100}
                      />
                    </div>
                    {ent.sub_node && (
                      <p className="text-[10px] text-on-surface-variant mt-3 leading-relaxed">
                        三级节点：{ent.sub_node}
                      </p>
                    )}
                  </div>

                  {/* ── 工商信息快速预览 ── */}
                  <div className="mb-6 pt-4 border-t border-outline-variant/10">
                    <h4 className="text-xs font-bold text-on-surface mb-3">工商信息</h4>
                    <div className="space-y-2 text-[10px]">
                      <InfoRow label="法定代表人" value={ent.legal_representative} />
                      <InfoRow label="国标行业" value={ent.chain_node ?? ent.industry_chain} />
                      <InfoRow
                        label="登记状态"
                        value={ent.reg_status}
                        valueClass={ent.reg_status === '存续' ? 'text-green-400 font-medium' : undefined}
                      />
                      <InfoRow label="所属区县" value={ent.location} />
                      <InfoRow label="统一信用代码" value={ent.credit_code} mono />
                    </div>
                    <button
                      onClick={() => setShowBusinessModal(true)}
                      className="w-full mt-4 py-2 bg-surface-container-low border border-outline-variant/20 rounded-lg text-[10px] font-bold text-on-surface hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1"
                    >
                      <Building2 className="w-3 h-3" />
                      查看完整工商信息
                    </button>
                  </div>

                  {/* ── 专利列表 ── */}
                  <div className="pt-4 border-t border-outline-variant/10">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-on-surface flex items-center gap-1">
                        <FileText className="w-3 h-3 text-primary" />
                        近期专利
                      </h4>
                      {patentsLoading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                      {!patentsLoading && (
                        <span className="text-[10px] text-on-surface-variant">
                          共 {ent.patent_count ?? patents.length} 件
                        </span>
                      )}
                    </div>
                    {patents.length === 0 && !patentsLoading ? (
                      <p className="text-[10px] text-on-surface-variant text-center py-4">暂无专利数据</p>
                    ) : (
                      <div className="space-y-2">
                        {patents.map((p) => (
                          <div
                            key={p.id}
                            className="p-2.5 rounded-lg bg-surface-container-low/60 border border-outline-variant/5 hover:border-outline-variant/20 transition-colors"
                          >
                            <p className="text-[10px] font-bold text-on-surface leading-snug line-clamp-2">{p.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">{p.patent_type}</span>
                              {p.pub_date && (
                                <span className="text-[8px] text-on-surface-variant">{p.pub_date}</span>
                              )}
                              {p.ipc_codes && (
                                <span className="text-[8px] text-on-surface-variant truncate max-w-[80px]" title={p.ipc_codes}>
                                  {p.ipc_codes.split(',')[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 图例（左下） ── */}
        <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-4 p-5 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-2xl w-48">
          <div>
            <h4 className="text-xs font-bold text-on-surface mb-3">链位</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-xs text-on-surface-variant font-medium">上游</span></div>
              <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-secondary" /><span className="text-xs text-on-surface-variant font-medium">中游</span></div>
              <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-tertiary" /><span className="text-xs text-on-surface-variant font-medium">下游</span></div>
            </div>
          </div>
          <div className="pt-4 border-t border-outline-variant/10">
            <h4 className="text-xs font-bold text-on-surface mb-3">产业关联性</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-outline-variant" /><span className="text-xs text-on-surface-variant font-medium">强 (实心大圆)</span></div>
              <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full bg-outline-variant" /><span className="text-xs text-on-surface-variant font-medium">较强 (中圆)</span></div>
              <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-outline-variant" /><span className="text-xs text-on-surface-variant font-medium">中 (小圆)</span></div>
            </div>
          </div>
        </div>

        {/* ── 缓冲区 / 等时圈信息（右下，避开详情面板） ── */}
        {(activeTool === 'buffer' || activeTool === 'isochrone') && (
          <div className={cn(
            'absolute bottom-6 z-10 flex flex-col gap-2 p-5 bg-surface-bright/90 backdrop-blur-xl border border-outline-variant/20 rounded-2xl shadow-2xl w-52 transition-all duration-300',
            ent ? 'right-[340px]' : 'right-6',
          )}>
            <h4 className="text-xs font-bold text-on-surface mb-1 flex items-center gap-2">
              {isochroneLoading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              {activeTool === 'isochrone'
                ? `等时圈 · ${isochroneTime} · 驾车`
                : `缓冲区内 · ${bufferRadius}km`}
            </h4>

            {/* 加载中状态 */}
            {isochroneLoading && (
              <p className="text-[10px] text-on-surface-variant">正在计算路径规划，请稍候...</p>
            )}

            {/* 没有选中企业 */}
            {!isochroneLoading && !ent && (
              <p className="text-[10px] text-on-surface-variant">请先在地图上选择一个企业</p>
            )}

            {/* 等时圈计算中但尚未获到多边形 */}
            {!isochroneLoading && ent && activeTool === 'isochrone' && isochronePolygon.length === 0 && (
              <p className="text-[10px] text-on-surface-variant">等待计算结果...</p>
            )}

            {/* 统计数据 */}
            {!isochroneLoading && ent && areaStats && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                    上游
                  </span>
                  <span className="text-on-surface font-bold">{areaStats.upstream} 家</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-secondary inline-block" />
                    中游
                  </span>
                  <span className="text-on-surface font-bold">{areaStats.midstream} 家</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-tertiary inline-block" />
                    下游
                  </span>
                  <span className="text-on-surface font-bold">{areaStats.downstream} 家</span>
                </div>
                <div className="flex justify-between text-xs font-medium pt-1.5 border-t border-outline-variant/10">
                  <span className="text-on-surface-variant">共计</span>
                  <span className="text-on-surface font-bold">{areaStats.total} 家</span>
                </div>
                <p className="text-[9px] text-on-surface-variant/60 pt-0.5">
                  {activeTool === 'isochrone' ? '绿色多边形 = 等时圈范围' : '虚线圈 = 缓冲区范围'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ───── 完整工商信息弹窗 ───── */}
        <AnimatePresence>
          {showBusinessModal && ent && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowBusinessModal(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col max-h-[85vh]"
              >
                {/* 弹窗头部 */}
                <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-highest/50">
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">{ent.name}</h3>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">完整工商登记信息</p>
                  </div>
                  <button
                    onClick={() => setShowBusinessModal(false)}
                    className="p-2 hover:bg-surface-container-highest rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* 弹窗内容 */}
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                  {/* 基础登记信息 */}
                  <div>
                    <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">基础登记信息</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
                      <ModalField label="统一社会信用代码" value={ent.credit_code} mono />
                      <ModalField label="注册资本" value={formatCapital(ent.registered_capital)} />
                      <ModalField label="实缴资本" value={formatCapital(ent.paid_in_capital)} />
                      <ModalField label="成立日期" value={ent.founded_date} />
                      <ModalField
                        label="经营状态"
                        value={ent.reg_status}
                        valueClass={ent.reg_status === '存续' ? 'text-green-400' : undefined}
                      />
                      <ModalField label="法定代表人" value={ent.legal_representative} />
                      <ModalField label="企业类型" value={ent.org_type} />
                      <ModalField label="企业规模" value={ent.scale ? `${ent.scale}型` : undefined} />
                      <ModalField label="参保人数" value={ent.insured_employees != null ? `${ent.insured_employees} 人` : undefined} />
                      <ModalField label="登记机关" value={ent.reg_authority} />
                    </div>
                  </div>

                  {/* 地址信息 */}
                  {ent.registered_address && (
                    <div>
                      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">注册地址</h4>
                      <p className="text-sm text-on-surface font-medium leading-relaxed">{ent.registered_address}</p>
                    </div>
                  )}

                  {/* 经营范围 */}
                  {ent.business_scope && (
                    <div>
                      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">经营范围</h4>
                      <p className="text-sm text-on-surface font-medium leading-relaxed">{ent.business_scope}</p>
                    </div>
                  )}

                  {/* 企业简介 */}
                  {ent.description && (
                    <div>
                      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-2">企业简介</h4>
                      <p className="text-sm text-on-surface font-medium leading-relaxed">{ent.description}</p>
                    </div>
                  )}

                  {/* 产业链归属 */}
                  <div>
                    <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">产业链归属</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
                      <ModalField label="所属产业链" value={ent.industry_chain} />
                      <ModalField label="二级节点" value={ent.chain_node} />
                      <ModalField label="三级节点" value={ent.sub_node} />
                      <ModalField
                        label="链位"
                        value={ent.chain_position ? POSITION_LABEL[ent.chain_position] ?? ent.chain_position : undefined}
                      />
                      <ModalField label="关联强度" value={ent.association_level} />
                      <ModalField label="是否上市" value={ent.is_listed != null ? (ent.is_listed ? '是' : '否') : undefined} />
                    </div>
                  </div>

                  {/* 专利列表 */}
                  {patents.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">
                        专利列表（展示前 {patents.length} 件，共 {ent.patent_count} 件）
                      </h4>
                      <div className="space-y-3">
                        {patents.map((p, idx) => (
                          <div key={p.id} className="flex gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/10">
                            <span className="text-[10px] font-bold text-on-surface-variant w-5 shrink-0 pt-0.5">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-on-surface leading-snug">{p.title}</p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">{p.patent_type}</span>
                                {p.pub_date && <span className="text-[8px] text-on-surface-variant">公开：{p.pub_date}</span>}
                                {p.ipc_codes && (
                                  <span className="text-[8px] text-on-surface-variant">IPC：{p.ipc_codes}</span>
                                )}
                              </div>
                              {p.abstract && (
                                <p className="text-[10px] text-on-surface-variant mt-1.5 line-clamp-2 leading-relaxed">{p.abstract}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 弹窗底部 */}
                <div className="px-6 py-4 border-t border-outline-variant/10 bg-surface-container-highest/30 flex justify-end">
                  <button
                    onClick={() => setShowBusinessModal(false)}
                    className="px-6 py-2 bg-primary text-on-primary rounded-lg font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                  >
                    确定
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

// ─────────────────────────────────────
// 子组件
// ─────────────────────────────────────

/** 进度条评分行 */
function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-medium">
        <span className="text-on-surface-variant">{label}</span>
        <span className="text-on-surface">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 侧边栏信息行 */
function InfoRow({
  label, value, valueClass, mono,
}: {
  label: string;
  value?: string | null;
  valueClass?: string;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-on-surface-variant shrink-0">{label}</span>
      <span className={cn('text-on-surface font-medium text-right truncate max-w-[140px]', mono && 'font-mono text-[9px]', valueClass)}>
        {value}
      </span>
    </div>
  );
}

/** 弹窗字段行 */
function ModalField({
  label, value, valueClass, mono,
}: {
  label: string;
  value?: string | null;
  valueClass?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">{label}</span>
      <span className={cn('text-sm text-on-surface font-medium', mono && 'font-mono text-xs', valueClass)}>
        {value ?? <span className="text-on-surface-variant/50 italic text-xs">未录入</span>}
      </span>
    </div>
  );
}
