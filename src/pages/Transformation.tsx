import { Plus, Minus, Layers, ArrowRight, Sun, Battery, Wind, RefreshCw, Trophy, Award, Star, X } from 'lucide-react';
import Layout from '../components/Layout';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, memo } from 'react';
import { fetchTransitionDashboard, TransitionDashboardData, TransitionMapPoint } from '../api/transition';
import { apiClient } from '../api/client';
import { PatentDetail } from '../api/enterprises';

function loadAmapScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) {
      resolve();
      return;
    }
    const key = import.meta.env.VITE_AMAP_KEY;
    if (!key || key === 'your_amap_key_here') {
      reject(new Error('AMAP_KEY_NOT_SET'));
      return;
    }
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('AMap SDK load failed'));
    document.head.appendChild(script);
  });
}

const TransitionMapComponent = memo(({ points }: { points: TransitionMapPoint[] }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    loadAmapScript().then(() => {
      if (!mapContainerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = new (window as any).AMap.Map(mapContainerRef.current, {
          viewMode: '2D',
          zoom: 10,
          center: [121.55, 29.87],
          mapStyle: 'amap://styles/dark',
          resizeEnable: true,
        });
      }
      const map = mapRef.current;

      markersRef.current.forEach(m => map.remove(m));
      markersRef.current = [];

      // NOTE: 产业校准阈值 —— 宁波NEV产业链整体已处活跃转型期，领先门槛为55分
      const ASSOC_COLORS = [
        { min: 55, color: '#1D9E75' },  // 转型领先
        { min: 40, color: '#97C459' },  // 积极转型
        { min: 30, color: '#EF9F27' },  // 初步转型
        { min: 0,  color: '#888780' },  // 传统为主
      ];

      points.forEach(point => {
        const colorObj = ASSOC_COLORS.find(c => point.transition_index >= c.min) || ASSOC_COLORS[3];
        const color = colorObj.color;
        const size = point.transition_index >= 55 ? 16 : point.transition_index >= 40 ? 12 : 8;
        const half = Math.floor(size / 2);

        const content = `<div style="
          width:${size}px;height:${size}px;
          background:${color};
          border-radius:50%;
          border:1px solid rgba(255,255,255,0.7);
          box-shadow:0 0 8px ${color};
        "></div>`;

        const marker = new (window as any).AMap.Marker({
          position: [point.lng, point.lat],
          content,
          offset: new (window as any).AMap.Pixel(-half, -half),
          extData: point,
          title: `${point.name} (得分: ${point.transition_index})`,
          zIndex: point.transition_index,
        });

        map.add(marker);
        markersRef.current.push(marker);
      });
    }).catch(console.error);
  }, [points]);

  return <div ref={mapContainerRef} className="absolute inset-0 w-full h-full bg-[#0d1117]" />;
});
TransitionMapComponent.displayName = 'TransitionMapComponent';

export default function Transformation() {
  const [districtFilter, setDistrictFilter] = useState('全部区县');
  const [selectedIndustry, setSelectedIndustry] = useState('新能源汽车');
  
  const [dashboardData, setDashboardData] = useState<TransitionDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [showAllModal, setShowAllModal] = useState(false);
  const [showPatentModal, setShowPatentModal] = useState(false);
  const [selectedPatentCategory, setSelectedPatentCategory] = useState('');
  
  const [realPatents, setRealPatents] = useState<PatentDetail[]>([]);
  
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showPatentDownloadConfirm, setShowPatentDownloadConfirm] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloadingPatents, setIsDownloadingPatents] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchTransitionDashboard(
        selectedIndustry === '全部产业链' ? undefined : selectedIndustry,
        districtFilter === '全部区县' ? undefined : districtFilter
      );
      setDashboardData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [districtFilter, selectedIndustry]);

  const openPatentModal = async (category: string) => {
    setSelectedPatentCategory(category);
    setShowPatentModal(true);
    setRealPatents([]);
    try {
      // NOTE: 直接传入 ipc_prefix 参数，后端做前缀匹配过滤，返回该分类的真实专利
      const url = category && category !== '其他'
        ? `/patents/?ipc_prefix=${encodeURIComponent(category)}&page_size=100`
        : `/patents/?page_size=100`;
      const pats = await apiClient<PatentDetail[]>(url);
      setRealPatents(pats);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setShowExportConfirm(false);
    }, 1500);
  };

  const handlePatentDownload = () => {
    setIsDownloadingPatents(true);
    setTimeout(() => {
      setIsDownloadingPatents(false);
      setShowPatentDownloadConfirm(false);
    }, 1500);
  };

  const industryOptions = ['新能源汽车', '集成电路', '生物医药', '人工智能', '新材料', '全部产业链'];

  const metrics = dashboardData?.metrics || { total_enterprises: 0, enterprises_with_patents: 0, avg_transition_index: 0, leading_enterprises: 0 };
  const ranking = dashboardData?.ranking || [];
  const patents = dashboardData?.patent_distribution || [];
  const mapPoints = dashboardData?.map_points || [];

  // 计算专利前三类别（用于展示区块）
  const topPatents = patents.length > 0 ? patents.slice(0, 3) : [
    { ipc_prefix: 'H01M', count: 0, percentage: 0 },
    { ipc_prefix: 'B60L', count: 0, percentage: 0 },
    { ipc_prefix: 'H02K', count: 0, percentage: 0 }
  ];

  return (
    <Layout showSidebar={false}>
      <header className="mb-10 flex items-center justify-between border-b border-outline-variant/10 pb-6">
        <div className="flex items-center gap-8">
          <h1 className="text-3xl font-headline font-bold tracking-tight text-on-surface pr-8 border-r border-outline-variant/20">
            新能源转型看板
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">产业链:</span>
            <div className="bg-primary/5 px-2 py-1 rounded-lg border border-primary/20 shadow-sm">
              <select 
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="bg-transparent border-none text-sm text-primary font-bold focus:ring-0 cursor-pointer min-w-[120px]"
              >
                {industryOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="hidden xl:block text-right">
            <p className="text-on-surface-variant font-body text-[10px] leading-relaxed max-w-[200px] opacity-70">
              实时监测宁波市企业向新能源、智能网联方向的转型效率与技术布局深度。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">区域选择:</span>
            <div className="bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/10 shadow-sm">
              <select 
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="bg-transparent border-none text-sm text-on-surface font-bold focus:ring-0 cursor-pointer min-w-[100px]"
              >
                <option>全部区县</option>
                <option>海曙区</option>
                <option>江北区</option>
                <option>北仑区</option>
                <option>镇海区</option>
                <option>鄞州区</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center p-20 h-full">
           <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: '链上企业总数', value: metrics.total_enterprises.toLocaleString(), color: 'primary', progress: 100 },
              { label: '有专利企业数', value: metrics.enterprises_with_patents.toLocaleString(), color: 'secondary', progress: (metrics.enterprises_with_patents/Math.max(1, metrics.total_enterprises))*100 },
              { label: '平均转型指数', value: metrics.avg_transition_index.toString(), sub: '/ 100', color: 'tertiary', progress: metrics.avg_transition_index },
              { label: '转型领先企业', value: metrics.leading_enterprises.toLocaleString(), sub: '家', color: 'primary', progress: (metrics.leading_enterprises/Math.max(1, metrics.total_enterprises))*100 },
            ].map((m, i) => (
              <div key={i} className={cn(
                "bg-surface-container-low p-5 rounded-xl flex flex-col gap-1 border-l-4 shadow-lg",
                m.color === 'primary' ? "border-primary" : m.color === 'secondary' ? "border-secondary" : "border-tertiary"
              )}>
                <span className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">{m.label}</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-headline font-bold text-on-surface">{m.value}</span>
                  {m.sub && <span className="text-on-surface-variant text-sm">{m.sub}</span>}
                </div>
                <div className="mt-2 h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div className={cn(
                    "h-full",
                    m.color === 'primary' ? "bg-primary" : m.color === 'secondary' ? "bg-secondary" : "bg-tertiary"
                  )} style={{ width: `${m.progress}%` }}></div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-12 gap-6 h-[calc(100vh-320px)]">
            {/* Map */}
            <div className="col-span-12 lg:col-span-8 bg-surface-container-low rounded-xl overflow-hidden relative border border-outline-variant/10 shadow-xl">
              <div className="absolute top-4 left-4 z-10 glass-panel p-4 rounded-lg border border-outline-variant/10 shadow-2xl">
                <h3 className="font-headline font-bold text-primary mb-1">转型指数空间分布</h3>
                <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-tighter">企业转型代表性综合得分地理分布</p>
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#1D9E75] shadow-[0_0_8px_rgba(29,158,117,0.5)]"></span>
                    <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">转型领先 (55-100)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#97C459] shadow-[0_0_8px_rgba(151,196,89,0.5)]"></span>
                    <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">积极转型 (40-55)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#EF9F27] shadow-[0_0_8px_rgba(239,159,39,0.5)]"></span>
                    <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">初步转型 (30-40)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#888780] shadow-[0_0_8px_rgba(136,135,128,0.5)]"></span>
                    <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tighter">传统为主 (0-30)</span>
                  </div>
                </div>
              </div>
              
              <div className="w-full h-full relative">
                <TransitionMapComponent points={mapPoints} />
              </div>
            </div>

            {/* Right Column */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 h-full">
              {/* Rankings */}
              <div className="flex-1 bg-surface-container-low rounded-xl p-6 flex flex-col overflow-hidden border border-outline-variant/10 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-headline font-bold text-on-surface text-lg">转型创新领跑者</h3>
                    <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">基于综合代表性分数</p>
                  </div>
                  <button 
                    onClick={() => setShowAllModal(true)}
                    className="text-primary text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:underline"
                  >
                    查看全部 <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                  {ranking.slice(0, 5).map((item, index) => (
                    <div key={index} className="group flex items-center gap-4 p-3 rounded-lg hover:bg-surface-container-high transition-all border border-transparent hover:border-outline-variant/10">
                      <span className={cn(
                        "text-2xl font-headline font-bold italic transition-colors",
                        index === 0 ? "text-tertiary" : index === 1 ? "text-secondary" : index === 2 ? "text-primary" : "text-outline-variant"
                      )}>{item.rank.toString().padStart(2, '0')}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-on-surface font-bold text-sm truncate">{item.name}</h4>
                        <p className="text-on-surface-variant text-[10px] uppercase tracking-tighter font-bold">{item.chain_node}</p>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          "font-bold font-headline",
                          index === 0 ? "text-tertiary" : index === 1 ? "text-secondary" : index === 2 ? "text-primary" : "text-on-surface"
                        )}>{item.score.toFixed(1)}</div>
                        <div className="text-[9px] font-bold text-on-surface-variant">{item.patents} 项专利</div>
                      </div>
                    </div>
                  ))}
                  {ranking.length === 0 && <p className="text-sm text-on-surface-variant text-center opacity-70">暂无数据</p>}
                </div>
              </div>

              {/* Patent Tech */}
              <div className="flex-1 bg-surface-container-low rounded-xl p-6 flex flex-col border border-outline-variant/10 shadow-xl">
                <h3 className="font-headline font-bold text-on-surface text-lg mb-4">专利 IPC 技术分布</h3>
                <div className="flex-1 relative flex items-center justify-center p-4">
                  <div className="w-full h-full flex gap-1">
                    {topPatents[0] && (
                      <div 
                        onClick={() => openPatentModal(topPatents[0].ipc_prefix)}
                        className="flex-[3] bg-primary/10 rounded flex flex-col items-center justify-center border border-primary/20 p-2 text-center group hover:bg-primary/20 transition-all cursor-pointer"
                      >
                        <Sun className="text-primary mb-2 w-5 h-5" />
                        <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">{topPatents[0].ipc_prefix}</span>
                        <span className="text-sm font-bold text-on-surface">{topPatents[0].percentage}% ({topPatents[0].count}项)</span>
                      </div>
                    )}
                    <div className="flex-[2] flex flex-col gap-1">
                      {topPatents[1] && (
                        <div 
                          onClick={() => openPatentModal(topPatents[1].ipc_prefix)}
                          className="flex-1 bg-secondary/10 rounded flex flex-col items-center justify-center border border-secondary/20 p-1 text-center group hover:bg-secondary/20 transition-all cursor-pointer"
                        >
                          <Battery className="text-secondary w-4 h-4 mb-1" />
                          <span className="text-[10px] font-bold text-secondary uppercase tracking-tighter">{topPatents[1].ipc_prefix}</span>
                          <span className="text-xs font-bold text-on-surface">{topPatents[1].percentage}%</span>
                        </div>
                      )}
                      {topPatents[2] && (
                        <div 
                          onClick={() => openPatentModal(topPatents[2].ipc_prefix)}
                          className="flex-1 bg-tertiary/10 rounded flex flex-col items-center justify-center border border-tertiary/20 p-1 text-center group hover:bg-tertiary/20 transition-all cursor-pointer"
                        >
                          <Wind className="text-tertiary w-4 h-4 mb-1" />
                          <span className="text-[10px] font-bold text-tertiary uppercase tracking-tighter">{topPatents[2].ipc_prefix}</span>
                          <span className="text-xs font-bold text-on-surface">{topPatents[2].percentage}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Floating Legend Bottom */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass-panel px-8 py-3 rounded-full flex items-center gap-8 border border-outline-variant/10 shadow-2xl z-40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">数据流：活跃中</span>
        </div>
        <div className="h-4 w-px bg-outline-variant/30"></div>
        <button onClick={loadData} className="flex items-center gap-2 text-primary hover:text-primary-container transition-colors group">
          <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest">手动刷新</span>
        </button>
      </div>

      <AnimatePresence>
        {showAllModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAllModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-5xl h-[85vh] bg-surface-container-high rounded-3xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-highest/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-headline font-bold text-on-surface">转型创新领跑者 · TOP 20</h2>
                    <p className="text-xs text-on-surface-variant">基于综合代表性分数（专利、资本、规模）评定</p>
                  </div>
                </div>
                <button onClick={() => setShowAllModal(false)} className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/80 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col p-6">
                <div className="flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-outline-variant/10">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-surface-container-highest shadow-sm">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">排名</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">企业名称</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">相关节点</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-center">转型指数</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-center">专利总数</th>
                        <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">上市公司</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5">
                      {ranking.map((ent) => (
                        <tr key={ent.rank} className="hover:bg-primary/5 transition-colors group">
                          <td className="px-6 py-4">
                            <span className={cn(
                              "text-sm font-headline font-bold italic",
                              ent.rank <= 3 ? "text-primary" : "text-on-surface-variant"
                            )}>
                              {ent.rank.toString().padStart(2, '0')}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {ent.rank <= 3 && <Award className="w-3 h-3 text-primary" />}
                              <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{ent.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-surface-container-highest text-[10px] font-bold rounded text-on-surface-variant">
                              {ent.chain_node}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-headline font-bold text-primary">{ent.score.toFixed(1)}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-mono text-on-surface-variant">{ent.patents}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded",
                              ent.is_listed ? "bg-primary/10 text-primary" : "bg-outline-variant/10 text-outline-variant"
                            )}>
                              {ent.is_listed ? '是' : '否'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPatentModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPatentModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="relative w-full max-w-4xl h-[80vh] bg-surface-container-high rounded-3xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-highest/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center">
                    <Star className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-headline font-bold text-on-surface">相关专利名录 · {selectedPatentCategory} (近期)</h2>
                    <p className="text-xs text-on-surface-variant">展示该技术分类下的最新专利布局与创新成果</p>
                  </div>
                </div>
                <button onClick={() => setShowPatentModal(false)} className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/80 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col p-6">
                <div className="flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-outline-variant/10">
                  <table className="w-full text-left border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[42%]" />
                      <col className="w-[20%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[8%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-surface-container-highest shadow-sm">
                      <tr>
                        <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">专利名称</th>
                        <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">分类号 (IPC)</th>
                        <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">申请人</th>
                        <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">公开日期</th>
                        <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">类型</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/5">
                      {realPatents.map((pat) => (
                        <tr key={pat.id} className="hover:bg-secondary/5 transition-colors group align-top">
                          {/* 专利名称：允许换行，确保可读 */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-on-surface group-hover:text-secondary transition-colors leading-snug break-words">
                              {pat.title}
                            </span>
                          </td>
                          {/* IPC 分类号：截断但可 hover 悬停查看 */}
                          <td className="px-4 py-3">
                            <span title={pat.ipc_codes || ''} className="block px-2 py-0.5 bg-surface-container-highest text-[10px] font-mono rounded text-on-surface-variant truncate">
                              {pat.ipc_codes || '—'}
                            </span>
                          </td>
                          {/* 申请人：加粗，截断 */}
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-secondary break-words leading-snug">
                              {pat.applicant || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-on-surface-variant font-mono whitespace-nowrap">{pat.pub_date || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap",
                              pat.patent_type === '发明' ? "bg-primary/10 text-primary" : "bg-tertiary/10 text-tertiary"
                            )}>
                              {pat.patent_type || '发明'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {realPatents.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-sm text-outline-variant">加载中，请稍候…</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
