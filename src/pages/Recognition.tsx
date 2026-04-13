import { Wand2, UploadCloud, CheckCircle2, Search, Filter, Trash2, ChevronDown, RefreshCw, AlertCircle, FileText, Download, Loader2, X, Building2, MapPin, Calendar, Fingerprint, Activity, Cpu, Zap, AlertTriangle, ChevronRight, CheckCheck } from 'lucide-react';
import Layout from '../components/Layout';
import { cn } from '../lib/utils';
import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { nevPredict, getNevHealth, nevStart, type NevPredictResponse } from '../api/recognize';
import * as XLSX from 'xlsx';
import {
  createRecognitionTask, listRecognitionTasks, getTaskSummary, rejectTask, confirmTask, geocodeAddress,
  type RecognitionTaskDetail, type RecognitionTaskConfirm,
} from '../api/recognitionTask';

const INDUSTRY_NODES_MOCK: Record<string, string[]> = {
  '上游': ['关键原材料', '电池材料', '锂电设备', '核心电子元器件', '电控系统组件'],
  '中游': ['核心零部件', '新能源汽车整车'],
  '下游': ['汽车服务', '新能源汽车充电及换电'],
};

const initialRecognitionCards = [
  {
    id: 'NB-882941-X',
    name: '宁波光电技术解决方案有限公司',
    tag: '新增',
    description: '"专业从事半导体用蓝宝石晶体衬底的开发及精密光学镀膜..."',
    results: [
      { label: '上游：半导体材料', score: 94, color: 'primary' },
      { label: '中游：光学组件', score: 42, color: 'outline' },
      { label: '下游：消费电子', score: 12, color: 'outline' },
    ],
    details: {
      address: '宁波市鄞州区科技园区光电大道 88 号',
      legalPerson: '张光远',
      establishedDate: '2015-06-12',
      creditCode: '91330212MA281X8829',
      nodes: [
        { label: '正极材料', score: 98, type: '上游' },
        { label: '负极材料', score: 92, type: '上游' },
        { label: '电芯', score: 45, type: '中游' },
        { label: '乘用车', score: 15, type: '下游' }
      ]
    }
  },
];

const extraRecognitionCards = Array.from({ length: 21 }, (_, i) => ({
  id: `NB-EXT-${100000 + i}`,
  name: `宁波${['科技', '智能', '精密', '电子', '新材料'][i % 5]}${['发展', '制造', '研究', '系统'][i % 4]}有限公司`,
  tag: i % 3 === 0 ? '待定' : '新增',
  description: '"专注于产业链关键环节的技术突破与产业化应用..."',
  results: [
    { label: '上游：基础材料', score: 70 + (i % 20), color: 'primary' },
    { label: '中游：核心组件', score: 40 + (i % 15), color: 'outline' },
    { label: '下游：终端产品', score: 20 + (i % 10), color: 'outline' },
  ],
  details: {
    address: `宁波市某园区第 ${i + 1} 号楼`,
    legalPerson: `负责人 ${String.fromCharCode(65 + (i % 26))}`,
    establishedDate: '2020-01-01',
    creditCode: `91330200MA2${i}XXXXX`,
    nodes: [
      { label: INDUSTRY_NODES_MOCK['上游'][i % 5], score: 75 + (i % 10), type: '上游' },
      { label: INDUSTRY_NODES_MOCK['中游'][i % 2], score: 45 + (i % 10), type: '中游' }
    ]
  }
}));

const initialConfirmedCards = [
  {
    id: 'NB-CONF-001',
    name: '宁波海天精工股份有限公司',
    tag: '已确认',
    description: '"国内领先的数控机床研发制造企业，专注于高档数控机床的国产化..."',
    results: [
      { label: '中游：数控机床', score: 98, color: 'primary' },
      { label: '上游：铸件加工', score: 45, color: 'outline' },
      { label: '下游：汽车制造', score: 30, color: 'outline' },
    ],
    details: {
      address: '宁波市北仑区黄山路',
      legalPerson: '张静章',
      establishedDate: '2002-03-15',
      creditCode: '913302007369XXXXXX',
      nodes: [
        { label: '立式加工中心', score: 99, type: '中游' },
        { label: '龙门加工中心', score: 97, type: '中游' }
      ]
    }
  }
];

// 将 nev_api 层级结果转化为卡片 results 格式
function buildCardFromNevResponse(
  name: string,
  creditCode: string,
  businessScope: string,
  res: NevPredictResponse,
  threshold: number = 0.30,
) {
  const results: { label: string; score: number; color: string }[] = [];
  const nodes: { label: string; score: number; type: string }[] = [];

  const stage = res.stage;
  const second = res.second;
  const third = res.third;
  const stageScores = res.score_detail?.['\u73af\u8282'] ?? {};
  const secondScores = res.score_detail?.['\u4e8c\u7ea7\u5206\u7c7b'] ?? {};
  const thirdScores = res.score_detail?.['\u4e09\u7ea7\u5206\u7c7b'] ?? {};

  const COLORS = ['primary', 'secondary', 'tertiary', 'outline'];

  if (stage.label) {
    const stageScore = Math.round(stage.confidence * 100);
    const primaryLabel = second.label
      ? `${stage.label}\uff1a${second.label}`
      : stage.label;
    results.push({ label: primaryLabel, score: stageScore, color: 'primary' });

    // 所有超过阈值的候选环节作为次要结果
    let ci = 1;
    for (const [lbl, prob] of Object.entries(stageScores)
      .filter(([l, p]) => l !== stage.label && p >= threshold)
      .sort(([, a], [, b]) => b - a)) {
      results.push({ label: `${lbl}\uff08${Math.round(prob * 100)}%\uff09`, score: Math.round(prob * 100), color: COLORS[ci % 4] });
      ci++;
    }
  } else {
    // 展示最高分候选，即使未达阈值
    const topEntry = Object.entries(stageScores).sort(([, a], [, b]) => b - a)[0];
    if (topEntry) {
      results.push({ label: `\u672a\u8fbe\u9608\u503c\uff08\u6700\u9ad8\uff1a${topEntry[0]} ${Math.round(topEntry[1] * 100)}%\uff09`, score: Math.round(topEntry[1] * 100), color: 'outline' });
    } else {
      results.push({ label: '\u672a\u8bc6\u522b\uff08\u7f6e\u4fe1\u5ea6\u4e0d\u8db3\uff09', score: 0, color: 'outline' });
    }
  }

  // nodes: \u6536集所有超过阈值的二级+三级分类
  const stageLabel = stage.label || '\u672a\u77e5';

  // 二级\uff1a\u4e3b判定 + 其他超过阈值的候选
  for (const [lbl, prob] of Object.entries(secondScores)
    .filter(([, p]) => p >= threshold)
    .sort(([, a], [, b]) => b - a)) {
    nodes.push({
      label: lbl,
      score: Math.round(prob * 100),
      type: stageLabel + (lbl === second.label ? '' : '\uff08\u5019\u9009\uff09'),
    });
  }

  // 三级: 主判定 + 其他超过阈值的候选
  for (const [lbl, prob] of Object.entries(thirdScores)
    .filter(([, p]) => p >= threshold)
    .sort(([, a], [, b]) => b - a)) {
    nodes.push({
      label: lbl,
      score: Math.round(prob * 100),
      type: second.label ? `${second.label}\u2192` : stageLabel,
    });
  }

  const lowConf = stage.low_confidence || second.low_confidence;

  return {
    id: `NB-ML-${Date.now()}`,
    name,
    tag: lowConf ? '\u4f4e\u7f6e\u4fe1\u5ea6' : '\u65b0\u589e',
    description: `"${businessScope.substring(0, 60)}..."`,
    results,
    details: {
      address: '',
      legalPerson: '',
      establishedDate: '',
      creditCode,
      nodes,
      nevResult: res,
    },
  };
}

export default function Recognition() {
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [statusTab, setStatusTab] = useState<'pending' | 'confirmed' | 'all'>('pending');
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [autoConfirm, setAutoConfirm] = useState(true);
  // NOTE: DB 任务列表替代本地 mock — pendingCards/confirmedCards 仍用于批量识别的即时展示，
  // DB 任务列表由 dbTasks 状态管理，通过 loadTasks 刷新
  const [pendingCards, setPendingCards] = useState<typeof initialRecognitionCards>([]);
  const [confirmedCards, setConfirmedCards] = useState<typeof initialConfirmedCards>([]);

  // ── DB 任务列表（从后端加载）──
  const [dbTasks, setDbTasks] = useState<RecognitionTaskDetail[]>([]);
  const [taskSummary, setTaskSummary] = useState({ pending: 0, confirmed: 0, rejected: 0, total: 0 });
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // ── 确认入库弹窗 ──
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    task: RecognitionTaskDetail | null;
    isSubmitting: boolean;
    geocoding: boolean;
    geoResult?: { lat?: number; lng?: number; formatted?: string; success?: boolean };
    form: RecognitionTaskConfirm;
  }>({
    open: false, task: null, isSubmitting: false, geocoding: false,
    form: { credit_code: '', province: '浙江省', city: '宁波市', district: '' },
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<typeof initialRecognitionCards[0] | null>(null);
  const [selectedMacroType, setSelectedMacroType] = useState<string | null>(null);
  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 表单状态
  const [companyName, setCompanyName] = useState('');
  const [creditCode, setCreditCode] = useState('');
  const [industryMajor, setIndustryMajor] = useState('');
  const [enterpriseIntro, setEnterpriseIntro] = useState('');
  const [businessScope, setBusinessScope] = useState('');

  // 多条专利/技术信息
  type PatentEntry = { id: number; title: string; abstract: string; ipc_codes: string };
  const [patents, setPatents] = useState<PatentEntry[]>([
    { id: Date.now(), title: '', abstract: '', ipc_codes: '' },
  ]);
  // 额外 IPC 代码（汇总级别，不附于单条专利）
  const [extraIpcCodes, setExtraIpcCodes] = useState('');
  // ML 推理置信度阈值（控制哪些候选节点会出现在结果中）
  const [mlThreshold, setMlThreshold] = useState(0.30);
  // 企业信息 vs 专利信息的权重（biz_weight：0=全专利, 1=全企业）
  const [bizWeight, setBizWeight] = useState(0.5);

  // 加载状态
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchFileRef = useRef<HTMLInputElement>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);

  // NEV 模型在线状态
  const [modelOnline, setModelOnline] = useState<boolean | null>(null);
  const [isStarting, setIsStarting] = useState(false);   // 按下按鈕、正在发请求
  const [isLaunching, setIsLaunching] = useState(false);  // 进程已拉起、模型预热中
  const [startError, setStartError] = useState<string | null>(null);

  // 轮询检查模型状态（每 5 秒一次）
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const check = () => {
      getNevHealth()
        .then(res => {
          setModelOnline(res.online);
          // 服务开始在线时清除「启动中」状态
          if (res.online) setIsLaunching(false);
        })
        .catch(() => setModelOnline(false));
    };
    check();
    timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, []);

  // 一键启动 nev_api
  const handleStartNev = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const res = await nevStart();
      if (!res.started && res.message?.includes('已在线')) {
        setModelOnline(true);
      } else if (res.started) {
        // 进程已拉起，等待轮询检测带它变绿
        setIsLaunching(true);
      }
    } catch (e: any) {
      const msg: string = e.message || '启动失败';
      if (msg.includes('后端服务未启动') || msg.includes('端口 8000')) {
        setStartError('主后端（端口 8000）未运行，请先在终端执行：cd backend && uvicorn main:app --port 8000');
      } else if (msg.includes('504') || msg.includes('超时')) {
        setStartError('推理引擎启动超时，请稍候刷新页面');
      } else {
        setStartError(msg);
      }
    } finally {
      setIsStarting(false);
    }
  };


  const handleIdentify = () => {
    if (!companyName || !businessScope) return;

    setIsIdentifying(true);
    setIdentifyError(null);

    nevPredict({
      enterprise_name: companyName,
      industry_major: industryMajor,
      business_scope: businessScope,
      enterprise_intro: enterpriseIntro,
      patents: patents
        .filter(p => p.title.trim() || p.abstract.trim())
        .map(p => ({
          title: p.title,
          abstract: p.abstract,
          ipc_codes: p.ipc_codes
            .split(/[,，\s]+/)
            .map(s => s.trim())
            .filter(Boolean),
        })),
      extra_ipc_codes: extraIpcCodes
        .split(/[,，\s]+/)
        .map(s => s.trim())
        .filter(Boolean),
      ipc_weight: 0.20,
      biz_weight: bizWeight,
      threshold_stage: mlThreshold,
      threshold_second: mlThreshold,
      threshold_third: mlThreshold,
    })
      .then(async (res) => {
        const newCard = buildCardFromNevResponse(companyName, creditCode, businessScope, res, mlThreshold);
        setPendingCards(prev => [newCard as any, ...prev]);

        // NOTE: 同时将识别结果持久化到 DB recognition_tasks 表
        try {
          await createRecognitionTask({
            enterprise_name: companyName,
            credit_code: creditCode || undefined,
            enterprise_intro: enterpriseIntro || undefined,
            business_scope: businessScope,
            industry_major: industryMajor || undefined,
            patents_json: JSON.stringify(patents.filter(p => p.title || p.abstract)),
            biz_weight: bizWeight,
            ipc_weight: 0.20,
            threshold: mlThreshold,
            ml_stage: res.stage?.label ?? undefined,
            ml_stage_conf: res.stage?.confidence ?? 0,
            ml_second: res.second?.label ?? undefined,
            ml_second_conf: res.second?.confidence ?? 0,
            ml_third: res.third?.label ?? undefined,
            ml_third_conf: res.third?.confidence ?? 0,
            ml_score_detail: JSON.stringify(res.score_detail ?? res['各级分数明细'] ?? {}),
            ml_models_used: JSON.stringify(res['使用模型'] ?? []),
          });
          // 写入成功后刷新 DB 任务列表
          loadTasks();
        } catch (e) {
          console.warn('任务持久化失败（不影响识别结果展示）', e);
        }

        // 重置表单
        setCompanyName('');
        setCreditCode('');
        setIndustryMajor('');
        setEnterpriseIntro('');
        setBusinessScope('');
        setPatents([{ id: Date.now(), title: '', abstract: '', ipc_codes: '' }]);
        setExtraIpcCodes('');
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(err => {
        setIdentifyError(err.message || '识别失败，请检查 NEV 推理服务是否在线');
      })
      .finally(() => {
        setIsIdentifying(false);
      });
  };

  const simulateLoading = (callback: () => void) => {
    setIsLoadingResults(true);
    callback();
    setTimeout(() => setIsLoadingResults(false), 500);
  };

  // 从 DB 加载任务列表
  const loadTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const [tasks, summary] = await Promise.all([
        listRecognitionTasks(statusTab === 'all' ? undefined : statusTab as any),
        getTaskSummary(),
      ]);
      setDbTasks(tasks);
      setTaskSummary(summary);
    } catch (e) {
      console.warn('加载任务列表失败', e);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [statusTab]);

  // 切换标签时重新加载
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // 打开确认弹窗
  const handleConfirm = (task: RecognitionTaskDetail) => {
    setConfirmDialog({
      open: true, task, isSubmitting: false, geocoding: false,
      form: {
        credit_code: task.credit_code ?? '',
        province: task.province ?? '浙江省',
        city: task.city ?? '宁波市',
        district: task.district ?? '',
        registered_capital: task.registered_capital,
        paid_in_capital: task.paid_in_capital,
        scale: task.scale ?? '',
        industry_category: task.industry_category ?? '',
        industry_major_filled: task.industry_major_filled ?? task.industry_major ?? '',
        industry_medium: task.industry_medium ?? '',
        industry_minor: task.industry_minor ?? '',
      },
    });
  };

  // 拒绝任务（调 API）
  const handleRejectTask = async (taskId: number) => {
    try {
      await rejectTask(taskId);
      loadTasks();
    } catch (e: any) {
      alert(`拒绝失败: ${e.message}`);
    }
  };

  // 本地卡片删除（mock 数据）
  const handleDelete = (id: string) => {
    setPendingCards(pendingCards.filter(card => card.id !== id));
    setConfirmedCards(confirmedCards.filter(card => card.id !== id));
  };

  // 提交确认入库
  const handleConfirmSubmit = async () => {
    const { task, form } = confirmDialog;
    if (!task) return;
    setConfirmDialog(d => ({ ...d, isSubmitting: true }));
    try {
      // 确认时调高德解码（仅在 confirm 时，不实时预览）
      let geoInfo = confirmDialog.geoResult;
      if (!geoInfo?.success && form.address) {
        setConfirmDialog(d => ({ ...d, geocoding: true }));
        try {
          const city = form.city || '宁波市';
          const fullAddr = `${form.province || ''}${city}${form.district || ''}${form.address}`;
          const geo = await geocodeAddress(fullAddr, city);
          geoInfo = { lat: geo.lat, lng: geo.lng, formatted: geo.formatted_address, success: geo.success };
          setConfirmDialog(d => ({ ...d, geoResult: geoInfo, geocoding: false }));
        } catch { /* 地理编码失败不阻断 */ }
      }
      await confirmTask(task.id, form);
      setConfirmDialog(d => ({ ...d, open: false, isSubmitting: false }));
      loadTasks();
    } catch (e: any) {
      setConfirmDialog(d => ({ ...d, isSubmitting: false, geocoding: false }));
      alert(`入库失败: ${e.message}`);
    }
  };

  // 下载批量识别 Excel 模板
  const downloadTemplate = () => {
    const headers = [
      '企业名称*', '统一信用代码', '国标行业', '企业简介', '经营范围*',
      '专利1标题', '专利1摘要', '专利1_IPC', '专利2标题', '专利2摘要', '专利2_IPC',
    ];
    const example = [
      '宁波某能源科技有限公司', '91330200XXXXXXXX', '制造业/新能源汽车',
      '专注锂电池研发制造', '锂离子电池、动力电池系统研发生产销售；电池材料研发；',
      '一种磷酸铁锂正极材料制备方法', '本发明涉及锂电池正极材料技术', 'H01M4/58,H01M10/0525',
      '动力电池热管理系统', '涉及电动汽车电池温控技术', 'H01M10/613',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    // 设置列宽
    ws['!cols'] = headers.map((h, i) => ({ wch: [16, 22, 16, 20, 40, 24, 24, 18, 24, 24, 18][i] }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '批量识别模板');
    XLSX.writeFile(wb, 'NEV批量识别模板.xlsx');
  };

  // 解析上传文件并逐行调用 nevPredict
  const handleFileChange = async (file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      setBatchError('仅支持 .xlsx / .xls / .csv 格式');
      return;
    }

    setBatchError(null);
    setIsBatchProcessing(true);
    setBatchProgress(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];

      // 第一行为标题行，跳过
      const dataRows = rows.slice(1).filter(r => r[0]?.toString().trim());
      if (dataRows.length === 0) {
        setBatchError('文件中没有有效数据（第1行为标题行，请从第2行开始填写）');
        setIsBatchProcessing(false);
        return;
      }

      const results: any[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const name = row[0]?.toString().trim();
        const creditCode = row[1]?.toString().trim() ?? '';
        const industryMajor = row[2]?.toString().trim() ?? '';
        const intro = row[3]?.toString().trim() ?? '';
        const scope = row[4]?.toString().trim() ?? '';

        // 解析最多 2 条专利
        const patents: { title: string; abstract: string; ipc_codes: string[] }[] = [];
        for (const offset of [5, 8]) {  // 专利1: col 5,6,7; 专利2: col 8,9,10
          const title = row[offset]?.toString().trim();
          if (title) {
            patents.push({
              title,
              abstract: row[offset + 1]?.toString().trim() ?? '',
              ipc_codes: (row[offset + 2]?.toString() ?? '')
                .split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
            });
          }
        }

        setBatchProgress({ done: i, total: dataRows.length, current: name });

        try {
          const res = await nevPredict({
            enterprise_name: name,
            industry_major: industryMajor,
            enterprise_intro: intro,
            business_scope: scope,
            patents,
            biz_weight: bizWeight,
            ipc_weight: 0.20,
            threshold_stage: mlThreshold,
            threshold_second: mlThreshold,
            threshold_third: mlThreshold,
          });
          results.push(buildCardFromNevResponse(name, creditCode, scope, res, mlThreshold));
        } catch {
          // 单条失败不中断，记录为错误卡片
          results.push({
            id: `BATCH-ERR-${Date.now()}-${i}`,
            name,
            tag: '识别失败',
            description: `"${scope.substring(0, 50)}..."`,
            results: [{ label: '推理服务错误', score: 0, color: 'outline' }],
            details: { address: '', legalPerson: '', establishedDate: '', creditCode, nodes: [] },
          });
        }
      }

      setBatchProgress({ done: dataRows.length, total: dataRows.length, current: '完成' });
      setPendingCards(prev => [...results, ...prev]);
      setTimeout(() => {
        setIsBatchProcessing(false);
        setBatchProgress(null);
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 800);

    } catch (e: any) {
      setBatchError(`文件解析失败：${e.message}`);
      setIsBatchProcessing(false);
    }
  };

  // 拖拽处理
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange(file);
  };

  // 点击上传区触发 input
  const handleBatchUpload = () => {
    if (!isBatchProcessing) batchFileRef.current?.click();
  };


  const handleToggleExpand = () => {
    simulateLoading(() => {
      setIsExpanded(!isExpanded);
    });
  };

  const openDetailModal = (card: typeof initialRecognitionCards[0]) => {
    setSelectedCard(card);
    // Find highest score result to set initial macro type
    if (card.results && card.results.length > 0) {
      const highest = [...card.results].sort((a, b) => b.score - a.score)[0];
      const type = highest.label.split('：')[0];
      setSelectedMacroType(type);
      
      // Also find the highest score node in that type
      if (card.details?.nodes) {
        const filteredNodes = card.details.nodes.filter(n => n.type === type);
        if (filteredNodes.length > 0) {
          const highestNode = [...filteredNodes].sort((a, b) => b.score - a.score)[0];
          setSelectedNodeLabel(highestNode.label);
        } else {
          setSelectedNodeLabel(null);
        }
      }
    }
  };

  // NOTE: DB任务参与结果展示：将 dbTasks 转换为卡片格式与 mock 混流
  const dbTaskCards = dbTasks.map(t => ({
    id: `DB-${t.id}`,
    _dbId: t.id,
    _dbStatus: t.status,
    _dbTask: t,
    name: t.enterprise_name,
    tag: t.status === 'confirmed' ? '已入库' : t.status === 'rejected' ? '已拒绝' : '待审核',
    description: `"${(t.business_scope ?? '').substring(0, 60)}..."`,
    results: [
      { label: [t.ml_stage, t.ml_second].filter(Boolean).join('→') || '未识别', score: Math.round((t.ml_stage_conf ?? 0) * 100), color: 'primary' },
      ...(t.ml_third ? [{ label: t.ml_third, score: Math.round((t.ml_third_conf ?? 0) * 100), color: 'secondary' as const }] : []),
    ],
    details: {
      address: t.address ?? '', legalPerson: '', establishedDate: '', creditCode: t.credit_code ?? '',
      nodes: [
        ...(t.ml_second ? [{ label: t.ml_second, score: Math.round((t.ml_second_conf ?? 0) * 100), type: t.ml_stage ?? '' }] : []),
        ...(t.ml_third ? [{ label: t.ml_third, score: Math.round((t.ml_third_conf ?? 0) * 100), type: t.ml_second ?? '' }] : []),
      ],
    },
  }));

  // NOTE: DB 任务显示在各 tab，mock 临时卡片只在「全部」里追加
  const allCards = (
    statusTab === 'pending'
      ? dbTaskCards.filter(c => c._dbStatus === 'pending')
      : statusTab === 'confirmed'
        ? dbTaskCards.filter(c => c._dbStatus === 'confirmed')
        : dbTaskCards  // 全部记录只显示 DB 数据
  ).filter(card => card.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // NOTE: 临时批量识别的 pendingCards 只在「全部」末尾追加供即时预览
  const tempCards = pendingCards.filter(c =>
    !dbTaskCards.some(d => d.name === c.name) &&
    String(c.name).toLowerCase().includes(searchTerm.toLowerCase())
  );
  const displayCards = statusTab === 'all' ? [...allCards, ...tempCards] : allCards;

  const currentCards = isExpanded ? displayCards : displayCards.slice(0, 6);
  const hasMore = displayCards.length > 6;

  return (
    <>
    <Layout showSidebar={false}>
      <header className="mb-10">
        <h1 className="text-4xl font-headline font-bold tracking-tight text-on-surface mb-2">智能识别工作台</h1>
        <p className="text-on-surface-variant font-body max-w-2xl">
          部署 NLP 模型将企业经营范围分类为精确的产业链节点，实现高可信度的空间映射。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Section */}
        <section className="lg:col-span-12">
          <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10 shadow-xl">
            <div className="flex border-b border-outline-variant/10">
              <button 
                onClick={() => setActiveTab('single')}
                className={cn(
                  "px-8 py-4 text-sm font-bold transition-all border-b-2",
                  activeTab === 'single' ? "text-primary border-primary bg-primary/5" : "text-on-surface-variant border-transparent hover:text-on-surface"
                )}
              >
                单条识别
              </button>
              <button 
                onClick={() => setActiveTab('batch')}
                className={cn(
                  "px-8 py-4 text-sm font-bold transition-all border-b-2",
                  activeTab === 'batch' ? "text-primary border-primary bg-primary/5" : "text-on-surface-variant border-transparent hover:text-on-surface"
                )}
              >
                批量识别
              </button>
            </div>

            <div className="p-8">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  {activeTab === 'single' ? (
                    <div className="space-y-4">
                      {/* 模型状态 + 一键启动 */}
                      {modelOnline ? (
                        /* ── 在线状态 ── */
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-primary text-xs font-bold">
                          <div className="relative flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <div className="w-2 h-2 rounded-full bg-primary absolute inset-0 animate-ping opacity-60" />
                          </div>
                          <Cpu className="w-4 h-4" />
                          <span>NEV 推理引擎在线 · LinearSVC + 概率融合 · 8 模型已预热</span>
                        </div>
                      ) : modelOnline === null ? (
                        /* ── 检测中 ── */
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface-container-highest/30 border border-outline-variant/10 text-on-surface-variant text-xs font-bold">
                          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                          <span>检测 NEV 推理引擎状态...</span>
                        </div>
                      ) : isLaunching ? (
                        /* ── 启动中状态（进程已拉起，模型预热中）── */
                        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3 text-amber-400 text-xs font-bold">
                            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                            <span>NEV 推理引擎启动中，模型预热约需 45 秒...</span>
                            <span className="ml-auto text-[10px] opacity-60">状态指示灯变绿后即可使用</span>
                          </div>
                          <div className="h-0.5 bg-surface-container-highest overflow-hidden">
                            <div className="h-full bg-amber-400 animate-pulse" style={{width: '60%'}} />
                          </div>
                        </div>
                      ) : (
                        /* ── 离线状态 + 启动按钮 ── */
                        <div className="rounded-xl bg-error/5 border border-error/20 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2 text-error text-xs font-bold">
                              <Cpu className="w-4 h-4 flex-shrink-0" />
                              <span>NEV 推理引擎离线</span>
                            </div>
                            <button
                              onClick={handleStartNev}
                              disabled={isStarting}
                              className="flex items-center gap-2 px-4 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-primary/20"
                            >
                              {isStarting ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  启动中（模型加载约 45 秒）...
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3 h-3" />
                                  一键启动推理引擎
                                </>
                              )}
                            </button>
                          </div>
                          {startError && (
                            <div className="px-4 pb-3 text-[10px] text-error flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              {startError}
                            </div>
                          )}
                          {isStarting && (
                            <div className="h-0.5 bg-surface-container-highest overflow-hidden">
                              <div className="h-full bg-primary animate-pulse w-3/4" />
                            </div>
                          )}
                        </div>
                      )}

                      {/* 企业基本信息 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-on-surface-variant ml-1">企业名称 *</label>
                          <input 
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="w-full bg-surface-container-lowest border-none rounded-lg px-4 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary" 
                            placeholder="输入企业名称..." 
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-on-surface-variant ml-1">统一信用代码</label>
                          <input 
                            value={creditCode}
                            onChange={(e) => setCreditCode(e.target.value)}
                            className="w-full bg-surface-container-lowest border-none rounded-lg px-4 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary" 
                            placeholder="输入信用代码..." 
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-on-surface-variant ml-1">国标行业分类（提升准确度）</label>
                        <input 
                          value={industryMajor}
                          onChange={(e) => setIndustryMajor(e.target.value)}
                          className="w-full bg-surface-container-lowest border-none rounded-lg px-4 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary" 
                          placeholder="如：制造业 / 汽车制造业 / 新能源汽车制造..." 
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-on-surface-variant ml-1">企业简介（可选）</label>
                        <input 
                          value={enterpriseIntro}
                          onChange={(e) => setEnterpriseIntro(e.target.value)}
                          className="w-full bg-surface-container-lowest border-none rounded-lg px-4 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary" 
                          placeholder="企业主要业务方向简述..." 
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-on-surface-variant ml-1">经营范围 *</label>
                        <textarea
                          value={businessScope}
                          onChange={(e) => setBusinessScope(e.target.value)}
                          className="w-full h-28 bg-surface-container-lowest border-none rounded-lg p-4 text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/50 transition-all font-body text-sm resize-none"
                          placeholder="请粘贴经营范围全文（新能源汽车零部件研发、生产和销售；动力电池材料的技术开发…）"
                        />
                      </div>

                      {/* 专利/技术信息（支持多条） */}
                      <div className="bg-surface-container-highest/20 rounded-xl border border-outline-variant/10 overflow-hidden">
                        {/* 标题栏 */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold text-on-surface">专利 / 技术信息辅助识别</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">{patents.filter(p=>p.title.trim()).length} 条</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-on-surface-variant italic">文本 + IPC 双路融合</span>
                            <button
                              type="button"
                              onClick={() => setPatents(prev => [...prev, { id: Date.now(), title: '', abstract: '', ipc_codes: '' }])}
                              className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-lg hover:bg-primary/20 transition-all"
                            >
                              + 添加专利
                            </button>
                          </div>
                        </div>

                        {/* 专利列表 */}
                        <div className="divide-y divide-outline-variant/10">
                          {patents.map((patent, idx) => (
                            <div key={patent.id} className="p-3 space-y-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-on-surface-variant font-bold">专利 #{idx + 1}</span>
                                {patents.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setPatents(prev => prev.filter(p => p.id !== patent.id))}
                                    className="p-0.5 text-on-surface-variant hover:text-error transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {/* 标题 */}
                              <input
                                value={patent.title}
                                onChange={e => setPatents(prev => prev.map(p => p.id === patent.id ? { ...p, title: e.target.value } : p))}
                                className="w-full bg-surface-container-lowest border-none rounded-lg px-3 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary"
                                placeholder="专利标题 / 技术名称（如：一种磷酸铁锂正极材料的制备方法）"
                              />
                              {/* 摘要 + IPC 同行 */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                  <input
                                    value={patent.abstract}
                                    onChange={e => setPatents(prev => prev.map(p => p.id === patent.id ? { ...p, abstract: e.target.value } : p))}
                                    className="w-full bg-surface-container-lowest border-none rounded-lg px-3 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary"
                                    placeholder="摘要 / 技术描述（可选）"
                                  />
                                </div>
                                <div className="relative">
                                  <input
                                    value={patent.ipc_codes}
                                    onChange={e => setPatents(prev => prev.map(p => p.id === patent.id ? { ...p, ipc_codes: e.target.value } : p))}
                                    className="w-full bg-surface-container-lowest border-none rounded-lg px-3 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary pr-8"
                                    placeholder="IPC 号 (逗号分隔)"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-primary font-bold opacity-60">IPC</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 全局额外 IPC 输入 */}
                        <div className="px-4 pb-3 pt-2 border-t border-outline-variant/10">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold text-on-surface-variant">额外 IPC 代码（汇总级，不附于单条专利）</span>
                            <span className="text-[9px] text-on-surface-variant/60">逗号分隔 · 如 H01M, B60L</span>
                          </div>
                          <input
                            value={extraIpcCodes}
                            onChange={e => setExtraIpcCodes(e.target.value)}
                            className="w-full bg-surface-container-lowest border-none rounded-lg px-3 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary"
                            placeholder="H01M10/052, B60L58/10, H02M7/48..."
                          />
                        </div>
                      </div>

                      {/* 错误提示 */}
                      {identifyError && (
                        <div className="flex items-start gap-2 p-3 bg-error/5 border border-error/20 rounded-xl text-xs text-error">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{identifyError}</span>
                        </div>
                      )}

                      {/* 推理参数控制面板 */}
                      <div className="space-y-3">
                        {/* 信号权重分配 */}
                        <div className="bg-surface-container-highest/20 rounded-xl px-4 py-3 border border-outline-variant/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-on-surface-variant">信号权重分配</span>
                            <span className="text-[10px] text-on-surface-variant/60">
                              企业 {Math.round(bizWeight * 100)}% · 专利 {Math.round((1 - bizWeight) * 100)}% · IPC 叠加 20%
                            </span>
                          </div>
                          {/* 双色权重条 */}
                          <div className="relative h-6 rounded-lg overflow-hidden flex mb-2 text-[10px] font-bold cursor-pointer">
                            <div
                              className="flex items-center justify-center bg-primary/70 text-on-primary transition-all duration-200"
                              style={{ width: `${bizWeight * 100}%` }}
                            >
                              {bizWeight > 0.2 && `经营范围 ${Math.round(bizWeight * 100)}%`}
                            </div>
                            <div
                              className="flex items-center justify-center bg-secondary/60 text-on-secondary transition-all duration-200"
                              style={{ width: `${(1 - bizWeight) * 100}%` }}
                            >
                              {(1 - bizWeight) > 0.2 && `专利文本 ${Math.round((1 - bizWeight) * 100)}%`}
                            </div>
                          </div>
                          <input
                            type="range"
                            min={0} max={100} step={10}
                            value={Math.round(bizWeight * 100)}
                            onChange={e => setBizWeight(Number(e.target.value) / 100)}
                            className="w-full accent-primary h-1 rounded-full cursor-pointer"
                          />
                          <div className="flex justify-between text-[9px] text-on-surface-variant/40 mt-1">
                            <span>← 专利主导</span>
                            <span className="text-primary/50">拖动调整</span>
                            <span>企业主导 →</span>
                          </div>
                        </div>

                        {/* 阈值滑块 + 识别按钮 */}
                        <div className="flex items-center gap-4 flex-wrap">
                          {/* 阈值控制 */}
                          <div className="flex-1 min-w-[220px] bg-surface-container-highest/20 rounded-xl px-4 py-2.5 border border-outline-variant/10">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-bold text-on-surface-variant">候选节点置信度阈值</span>
                              <span className="text-xs font-bold text-primary">{Math.round(mlThreshold * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={10} max={70} step={5}
                              value={Math.round(mlThreshold * 100)}
                              onChange={e => setMlThreshold(Number(e.target.value) / 100)}
                              className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
                            />
                            <div className="flex justify-between text-[9px] text-on-surface-variant/50 mt-1">
                              <span>10% 宽松</span>
                              <span className="text-primary/60">↑ 当前：{mlThreshold <= 0.25 ? '多候选模式' : mlThreshold <= 0.45 ? '平衡模式' : '高精度模式'}</span>
                              <span>70% 严格</span>
                            </div>
                          </div>

                          {/* 识别按钮 */}
                          <button
                            onClick={handleIdentify}
                            disabled={isIdentifying || !companyName || !businessScope}
                            className="px-8 py-3 bg-primary text-on-primary font-bold rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
                          >
                            {isIdentifying ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                推理中（ML模型）...
                              </>
                            ) : (
                              <>
                                <Zap className="w-4 h-4" />
                                立即识别
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 隐藏文件 input */}
                      <input
                        ref={batchFileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f); e.target.value = ''; }}
                      />

                      {/* 主上传区 */}
                      <div
                        onClick={handleBatchUpload}
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        className={cn(
                          "flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-2xl transition-all relative overflow-hidden",
                          isBatchProcessing
                            ? "border-primary/30 bg-primary/5 cursor-not-allowed"
                            : "border-outline-variant/20 bg-surface-container-lowest/50 hover:border-primary/40 hover:bg-primary/5 cursor-pointer group"
                        )}
                      >
                        {isBatchProcessing && batchProgress ? (
                          /* ── 处理中状态 ── */
                          <div className="flex flex-col items-center w-full px-8">
                            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                            <p className="text-on-surface font-bold mb-1">
                              正在识别第 {batchProgress.done + 1} / {batchProgress.total} 家企业
                            </p>
                            <p className="text-on-surface-variant text-xs mb-4 max-w-[260px] truncate text-center">
                              当前：{batchProgress.current}
                            </p>
                            {/* 进度条 */}
                            <div className="w-full max-w-[320px] bg-surface-container-highest/30 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all duration-500"
                                style={{ width: `${batchProgress.total > 0 ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-on-surface-variant/60 mt-2">
                              {batchProgress.done === batchProgress.total ? '✅ 识别完成，正在加载结果...' : '每家企业约 1-2 秒，请耐心等待'}
                            </p>
                          </div>
                        ) : (
                          /* ── 上传提示 ── */
                          <>
                            <UploadCloud className="w-12 h-12 text-on-surface-variant group-hover:text-primary transition-colors mb-3" />
                            <p className="text-on-surface font-bold">点击选择 或 拖拽 Excel 文件到此处</p>
                            <p className="text-on-surface-variant text-xs mt-1">支持 .xlsx · .xls · .csv，每行一家企业，无行数上限</p>
                          </>
                        )}
                      </div>

                      {/* 错误提示 */}
                      {batchError && (
                        <div className="flex items-start gap-2 px-4 py-3 bg-error/5 border border-error/20 rounded-xl text-xs text-error">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{batchError}</span>
                        </div>
                      )}

                      {/* 模板下载 + 字段说明 */}
                      <div className="bg-surface-container-highest/20 rounded-xl border border-outline-variant/10 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold text-on-surface">Excel 模板格式说明</span>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); downloadTemplate(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg hover:opacity-90 transition-all shadow-sm"
                          >
                            <Download className="w-3 h-3" />
                            下载模板
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="bg-surface-container-highest/30">
                                {['列', '字段名', '是否必填', '说明'].map(h => (
                                  <th key={h} className="px-3 py-2 text-left text-on-surface-variant font-bold">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/10">
                              {[
                                ['A', '企业名称', '✅ 必填', '企业全称'],
                                ['B', '统一信用代码', '可选', '18位信用代码'],
                                ['C', '国标行业', '可选', '如：制造业/新能源汽车'],
                                ['D', '企业简介', '可选', '企业主营业务简介'],
                                ['E', '经营范围', '✅ 必填', '工商注册经营范围（越完整越准确）'],
                                ['F', '专利1标题', '可选', '第1条专利/技术名称'],
                                ['G', '专利1摘要', '可选', '第1条专利技术描述'],
                                ['H', '专利1_IPC', '可选', 'IPC分类号，多个用逗号分隔'],
                                ['I-K', '专利2(同上)', '可选', '第2条专利，字段同F-H列'],
                              ].map(([col, field, req, desc]) => (
                                <tr key={col} className="hover:bg-surface-container-highest/10">
                                  <td className="px-3 py-2 font-mono text-primary font-bold">{col}</td>
                                  <td className="px-3 py-2 font-bold text-on-surface">{field}</td>
                                  <td className={`px-3 py-2 ${req.includes('必') ? 'text-error font-bold' : 'text-on-surface-variant'}`}>{req}</td>
                                  <td className="px-3 py-2 text-on-surface-variant">{desc}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Results Management Section */}
        <section id="results-section" className="lg:col-span-12 mt-4">
          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 shadow-sm mb-6">
            <div className="flex flex-wrap gap-6 items-center">
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-surface-container-highest/20 rounded-lg border border-outline-variant/5">
                <button
                  onClick={() => simulateLoading(() => setStatusTab('pending'))}
                  className={cn(
                    "px-4 py-1.5 rounded-md font-bold text-xs transition-all",
                    statusTab === 'pending' ? "text-primary bg-surface-container-high shadow-sm border border-primary/10" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  待审核 ({taskSummary.pending})
                </button>
                <button
                  onClick={() => simulateLoading(() => setStatusTab('confirmed'))}
                  className={cn(
                    "px-4 py-1.5 rounded-md font-bold text-xs transition-all",
                    statusTab === 'confirmed' ? "text-primary bg-surface-container-high shadow-sm border border-primary/10" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  已入库 ({taskSummary.confirmed})
                </button>
                <button
                  onClick={() => simulateLoading(() => setStatusTab('all'))}
                  className={cn(
                    "px-4 py-1.5 rounded-md font-bold text-xs transition-all",
                    statusTab === 'all' ? "text-primary bg-surface-container-high shadow-sm border border-primary/10" : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  全部记录 ({taskSummary.total})
                </button>
              </div>
              {/* 刷新按钮 */}
              <button
                onClick={() => loadTasks()}
                disabled={isLoadingTasks}
                className="ml-auto flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingTasks && "animate-spin")} />
                刷新
              </button>

              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary/30 focus:outline-none"
                  placeholder="按公司名称模糊搜索..."
                  type="text"
                />
              </div>

              {/* Parameters Integrated */}
              <div className="flex flex-wrap items-center gap-6 border-l border-outline-variant/10 pl-6">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-on-surface-variant whitespace-nowrap">置信度阈值</span>
                  <div className="flex items-center gap-2 w-32">
                    <input 
                      className="flex-1 accent-primary h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer" 
                      type="range" 
                      min={50}
                      max={100}
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
                    />
                    <span className="text-xs font-mono text-primary font-bold min-w-[32px]">{confidenceThreshold}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-on-surface-variant whitespace-nowrap">自动确认</span>
                  <button 
                    onClick={() => setAutoConfirm(!autoConfirm)}
                    className={cn(
                      "w-8 h-4 rounded-full relative transition-all duration-300",
                      autoConfirm ? "bg-primary" : "bg-surface-container-highest"
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all duration-300",
                      autoConfirm ? "right-0.5" : "left-0.5"
                    )}></div>
                  </button>
                </div>

                <div className="flex items-center gap-2 px-3 py-1 bg-secondary/5 rounded-full border border-secondary/10">
                  <CheckCircle2 className="w-3 h-3 text-secondary" />
                  <span className="text-[10px] font-bold text-secondary">V4.2</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recognition Cards Grid */}
          <div className="relative min-h-[400px]">
            {(isLoadingResults || isLoadingTasks) && (
              <div className="absolute inset-0 z-20 bg-background/40 backdrop-blur-[2px] flex items-center justify-center rounded-2xl">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm font-bold text-primary">正在加载...</p>
                </div>
              </div>
            )}

            {/* 空状态提示 */}
            {!isLoadingTasks && !isLoadingResults && displayCards.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 rounded-full bg-surface-container-highest/30 flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-on-surface-variant/40" />
                </div>
                <p className="text-on-surface font-bold mb-1">
                  {statusTab === 'pending' ? '暂无待审核记录' :
                   statusTab === 'confirmed' ? '暂无已入库记录' : '暂无识别记录'}
                </p>
                <p className="text-xs text-on-surface-variant/60">
                  {statusTab === 'pending'
                    ? '在上方输入企业信息，点击「开始识别」后结果将出现在此处'
                    : '点击「刷新」按钮更新列表'}
                </p>
              </div>
            )}

            <div className={cn(
              "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 transition-opacity duration-300",
              (isLoadingResults || isLoadingTasks) ? "opacity-30" : "opacity-100"
            )}>
              {currentCards.map((card) => {
              const maxScore = Math.max(...card.results.map(r => r.score));
              const isLowConfidence = maxScore < confidenceThreshold;
              
              return (
                <div 
                  key={card.id} 
                  onClick={() => openDetailModal(card)}
                  className={cn(
                    "bg-surface-container-low rounded-xl overflow-hidden border-t-2 transition-all group shadow-lg cursor-pointer",
                    isLowConfidence ? "border-error/40 hover:border-error" : "border-outline-variant/20 hover:border-primary"
                  )}
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-on-surface group-hover:text-primary transition-colors">{card.name}</h4>
                        <p className="text-xs text-on-surface-variant mt-1">ID: {card.id}</p>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-1 rounded border",
                        isLowConfidence ? "bg-error/10 text-error border-error/20" :
                        card.tag === '新增' ? "bg-primary/10 text-primary border-primary/20" : 
                        card.tag === '待定' ? "bg-secondary/10 text-secondary border-secondary/20" : 
                        card.tag === '已确认' ? "bg-success/10 text-success border-success/20" :
                        "bg-tertiary/10 text-tertiary border-tertiary/20"
                      )}>
                        {isLowConfidence ? '低置信度' : card.tag}
                      </span>
                    </div>
                    {isLowConfidence && (
                      <div className="mb-4 flex items-center gap-2 p-2 bg-error/5 border border-error/10 rounded text-[10px] text-error font-bold">
                        <AlertCircle className="w-3 h-3" />
                        识别置信度 ({maxScore}%) 低于阈值 ({confidenceThreshold}%)
                      </div>
                    )}
                    <div className="mb-5">
                      <p className="text-xs text-on-surface-variant line-clamp-2 italic">{card.description}</p>
                    </div>
                    <div className="space-y-4">
                      {confirmedCards.some(c => c.id === card.id) ? (
                        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                          <div className="flex-1">
                            <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">确认为</p>
                            <p className="text-sm font-bold text-on-surface">{card.results[0].label}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-on-surface-variant mb-0.5">置信度</p>
                            <p className="text-xs font-mono font-bold text-primary">{card.results[0].score}%</p>
                          </div>
                        </div>
                      ) : (
                        card.results.map((res, idx) => (
                          <div key={idx}>
                            <div className="flex justify-between items-end mb-1">
                              <span className={cn(
                                "text-sm font-semibold",
                                res.color === 'primary' ? "text-primary" : res.color === 'secondary' ? "text-secondary" : res.color === 'tertiary' ? "text-tertiary" : "text-on-surface"
                              )}>{res.label}</span>
                              <span className={cn(
                                "text-xs font-mono font-bold",
                                res.color === 'outline' ? "text-on-surface-variant" : 
                                res.color === 'primary' ? "text-primary" : 
                                res.color === 'secondary' ? "text-secondary" : "text-tertiary"
                              )}>{res.score}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  res.color === 'primary' ? "bg-primary" : res.color === 'secondary' ? "bg-secondary" : res.color === 'tertiary' ? "bg-tertiary" : "bg-on-surface-variant/40"
                                )}
                                style={{ width: `${res.score}%` }}
                              ></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-surface-container-high/50 flex gap-2 border-t border-outline-variant/10">
                    {/* DB 任务的操作按钮 */}
                    {(card as any)._dbTask ? (
                      (card as any)._dbStatus === 'pending' ? (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleConfirm((card as any)._dbTask); }}
                            className="flex-1 py-2 bg-primary-container/20 text-primary text-sm font-bold rounded-lg hover:bg-primary hover:text-on-primary transition-all border border-primary/20 flex items-center justify-center gap-1.5"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            确认并入库
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRejectTask((card as any)._dbId); }}
                            className="px-4 py-2 text-error text-sm font-bold rounded-lg hover:bg-error hover:text-on-error transition-all border border-error/20"
                          >
                            拒绝
                          </button>
                        </>
                      ) : (card as any)._dbStatus === 'confirmed' ? (
                        <div className="flex-1 py-2 text-success text-sm font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          已入库
                        </div>
                      ) : (
                        <div className="flex-1 py-2 text-error/70 text-sm font-bold flex items-center justify-center gap-2">
                          已拒绝
                        </div>
                      )
                    ) : (
                      /* Mock 卡片的原始操作 */
                      !confirmedCards.some(c => c.id === card.id) ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(card.id); }}
                          className="flex-1 py-2 bg-surface-container/40 text-on-surface-variant text-sm font-bold rounded-lg hover:bg-error/10 hover:text-error transition-all border border-outline-variant/20"
                        >
                          移除
                        </button>
                      ) : (
                        <div className="flex-1 py-2 text-success text-sm font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          已确认
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Load More / Toggle Expand */}
          {hasMore && (
            <div className="mt-12 flex justify-center">
              <button 
                onClick={handleToggleExpand}
                className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors font-headline font-semibold text-sm group"
              >
                {isExpanded ? (
                  <>
                    收起列表
                    <ChevronDown className="w-4 h-4 rotate-180 transition-transform" />
                  </>
                ) : (
                  <>
                    展开全部 {displayCards.length} 条记录
                    <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Floating Action */}
      <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-50">
        <div className="bg-surface-container-high rounded-full pl-2 pr-6 py-2 flex items-center gap-3 shadow-2xl glass-panel border border-primary/10">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center animate-spin-slow">
            <RefreshCw className="w-4 h-4 text-on-primary" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant leading-none mb-1 font-bold uppercase tracking-tighter">批量识别任务</p>
            <p className="text-xs font-bold text-on-surface leading-none">正在处理: 48% (240/500)</p>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedCard && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <div 
              onClick={() => setSelectedCard(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <div 
              className="relative w-full max-w-4xl max-h-[90vh] bg-surface-container-low rounded-2xl shadow-2xl overflow-hidden border border-outline-variant/10 flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-high">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-on-surface">{selectedCard.name}</h2>
                    <p className="text-xs text-on-surface-variant">统一社会信用代码: {selectedCard.details?.creditCode}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="p-2 hover:bg-surface-container-highest rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-on-surface-variant" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Left Column: Basic Info */}
                  <div className="lg:col-span-1 space-y-6">
                    <section>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                        <Activity className="w-3 h-3" />
                        基本信息
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-4 h-4 text-on-surface-variant mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-on-surface-variant uppercase">注册地址</p>
                            <p className="text-sm text-on-surface">{selectedCard.details?.address}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Fingerprint className="w-4 h-4 text-on-surface-variant mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-on-surface-variant uppercase">法定代表人</p>
                            <p className="text-sm text-on-surface">{selectedCard.details?.legalPerson}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Calendar className="w-4 h-4 text-on-surface-variant mt-0.5" />
                          <div>
                            <p className="text-[10px] font-bold text-on-surface-variant uppercase">成立日期</p>
                            <p className="text-sm text-on-surface">{selectedCard.details?.establishedDate}</p>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4">经营范围摘要</h3>
                      <p className="text-sm text-on-surface-variant leading-relaxed italic bg-surface-container-highest/30 p-4 rounded-xl border border-outline-variant/5">
                        {selectedCard.description}
                      </p>
                    </section>
                  </div>

                  {/* Right Column: Matching Results */}
                  <div className="lg:col-span-2 space-y-8">
                    <section>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center justify-between">
                        <span>产业链宏观匹配</span>
                        <span className="text-[10px] text-on-surface-variant normal-case font-medium">点击类别切换下方节点</span>
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(confirmedCards.some(c => c.id === selectedCard.id) ? [selectedCard.results[0]] : selectedCard.results).map((res, idx) => {
                          const type = res.label.split('：')[0];
                          const isActive = selectedMacroType === type;
                          
                          return (
                            <button 
                              key={idx} 
                              onClick={() => {
                                setSelectedMacroType(type);
                                if (selectedCard.details?.nodes) {
                                  const filtered = selectedCard.details.nodes.filter(n => n.type === type);
                                  if (filtered.length > 0) {
                                    const highest = [...filtered].sort((a, b) => b.score - a.score)[0];
                                    setSelectedNodeLabel(highest.label);
                                  }
                                }
                              }}
                              className={cn(
                                "p-4 rounded-xl border transition-all text-left relative overflow-hidden group/macro",
                                isActive 
                                  ? "bg-primary/10 border-primary shadow-md" 
                                  : "bg-surface-container-high border-outline-variant/10 hover:border-primary/40"
                              )}
                            >
                              <p className={cn(
                                "text-xs font-bold mb-2 transition-colors",
                                isActive ? "text-primary" : "text-on-surface-variant group-hover/macro:text-on-surface"
                              )}>{res.label}</p>
                              <div className="flex items-end justify-between">
                                <span className={cn(
                                  "text-2xl font-mono font-bold transition-colors",
                                  isActive ? "text-primary" : "text-on-surface-variant group-hover/macro:text-on-surface"
                                )}>{res.score}%</span>
                                <div className="w-12 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      isActive ? "bg-primary" : "bg-on-surface-variant/40"
                                    )}
                                    style={{ width: `${res.score}%` }}
                                  />
                                </div>
                              </div>
                              {isActive && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                        <span>{selectedMacroType} 细分节点匹配</span>
                        <div className="h-px flex-1 bg-outline-variant/10"></div>
                      </h3>
                      <div className="space-y-3">
                        {(() => {
                          let filteredNodes = selectedCard.details?.nodes.filter(node => !selectedMacroType || node.type === selectedMacroType) || [];
                          
                          // If confirmed, only show the top node that matches the macro result
                          if (confirmedCards.some(c => c.id === selectedCard.id)) {
                            filteredNodes = filteredNodes.slice(0, 1);
                          }
                          
                          return filteredNodes.map((node, idx) => {
                            const isSelected = node.label === selectedNodeLabel;
                            return (
                              <div 
                                key={node.label}
                                onClick={() => setSelectedNodeLabel(node.label)}
                                className={cn(
                                  "flex items-center gap-4 p-4 rounded-xl border transition-all group cursor-pointer relative overflow-hidden",
                                  isSelected 
                                    ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20" 
                                    : "bg-surface-container-lowest border-outline-variant/5 hover:border-primary/20"
                                )}
                              >
                                {isSelected && (
                                  <div className="absolute top-0 right-0">
                                    <div className="bg-primary text-on-primary p-1 rounded-bl-lg">
                                      <CheckCircle2 className="w-3 h-3" />
                                    </div>
                                  </div>
                                )}
                                <div className={cn(
                                  "w-2 h-2 rounded-full",
                                  node.type === '上游' ? "bg-primary" : node.type === '中游' ? "bg-secondary" : "bg-tertiary"
                                )} />
                                <div className="flex-1">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className={cn(
                                      "text-sm font-bold",
                                      isSelected ? "text-primary" : "text-on-surface"
                                    )}>{node.label}</span>
                                    <span className="text-xs font-mono font-bold text-primary">{node.score}%</span>
                                  </div>
                                  <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full transition-all duration-1000"
                                      style={{ width: `${node.score}%` }}
                                    />
                                  </div>
                                </div>
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded",
                                  isSelected ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"
                                )}>
                                  {node.type}
                                </span>
                              </div>
                            );
                          });
                        })()}
                        {selectedCard.details?.nodes.filter(node => !selectedMacroType || node.type === selectedMacroType).length === 0 && (
                          <div className="py-10 text-center border-2 border-dashed border-outline-variant/10 rounded-xl">
                            <p className="text-xs text-on-surface-variant italic">该分类下暂无细分节点匹配数据</p>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-outline-variant/10 bg-surface-container-high flex justify-end gap-3">
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="px-6 py-2 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  {confirmedCards.some(c => c.id === selectedCard.id) ? '关闭' : '取消'}
                </button>
                 {/* 详情弹窗确认按钒：DB任务打开确认弹窗，执行完就关闭弹窗 */}
                {(selectedCard as any)?._dbTask && (selectedCard as any)?._dbStatus === 'pending' && (
                  <button
                    onClick={() => {
                      handleConfirm((selectedCard as any)._dbTask);
                      setSelectedCard(null);
                    }}
                    className="px-8 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                  >
                    确认并入库
                  </button>
                )}
                {!confirmedCards.some(c => c.id === selectedCard.id) && !(selectedCard as any)?._dbTask && (
                  <button 
                    onClick={() => {
                      handleConfirm(selectedCard.id);
                      setSelectedCard(null);
                    }}
                    className="px-8 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                  >
                    确认并入库
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
    </Layout>

      {/* ───────── 确认入库弹窗 ───────── */}
      {confirmDialog.open && confirmDialog.task && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10">
              <div>
                <h2 className="text-base font-bold text-on-surface">确认并入库</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">{confirmDialog.task.enterprise_name}</p>
              </div>
              <button onClick={() => setConfirmDialog(d => ({ ...d, open: false }))} className="p-1.5 rounded-lg hover:bg-surface-container-highest/30 text-on-surface-variant">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-3 bg-primary/5 border-b border-outline-variant/10 flex flex-wrap gap-3 text-xs">
              <span className="font-bold text-on-surface-variant">ML 识别结果：</span>
              {[
                confirmDialog.task.ml_stage && `环节：${confirmDialog.task.ml_stage}（${Math.round((confirmDialog.task.ml_stage_conf || 0) * 100)}%）`,
                confirmDialog.task.ml_second && `二级：${confirmDialog.task.ml_second}（${Math.round((confirmDialog.task.ml_second_conf || 0) * 100)}%）`,
                confirmDialog.task.ml_third && `三级：${confirmDialog.task.ml_third}（${Math.round((confirmDialog.task.ml_third_conf || 0) * 100)}%）`,
              ].filter(Boolean).map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary rounded-full">{s}</span>
              ))}
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">统一信用代码 <span className="text-error">*</span></label>
                  <input value={confirmDialog.form.credit_code}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, credit_code: e.target.value } }))}
                    placeholder="18位统一信用代码"
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">企业规模</label>
                  <select value={confirmDialog.form.scale ?? ''}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, scale: e.target.value } }))}
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50">
                    <option value="">请选择</option>
                    {['微型', '小型', '中型', '大型'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">省</label>
                  <input value={confirmDialog.form.province ?? '浙江省'}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, province: e.target.value } }))}
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">市</label>
                  <input value={confirmDialog.form.city ?? '宁波市'}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, city: e.target.value } }))}
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">区/县</label>
                  <select value={confirmDialog.form.district ?? ''}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, district: e.target.value } }))}
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50">
                    <option value="">请选择</option>
                    {['海曙区','江北区','镇海区','北仑区','鄞州区','奉化区','余姚市','慈溪市','象山县','宁海县'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">注册地址（用于地图定位）</label>
                <input value={confirmDialog.form.address ?? ''}
                  onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, address: e.target.value }, geoResult: undefined }))}
                  placeholder="如：鄞州区天童南路123号"
                  className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                {confirmDialog.geoResult?.success && (
                  <p className="text-[10px] text-success mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    已解码：{confirmDialog.geoResult.formatted}（{confirmDialog.geoResult.lat?.toFixed(4)}, {confirmDialog.geoResult.lng?.toFixed(4)}）
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">注册资本（万元）</label>
                  <input type="number" min={0} value={confirmDialog.form.registered_capital ?? ''}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, registered_capital: e.target.value ? Number(e.target.value) : undefined } }))}
                    placeholder="如：1000"
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant mb-1 block">实缴资本（万元）</label>
                  <input type="number" min={0} value={confirmDialog.form.paid_in_capital ?? ''}
                    onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, paid_in_capital: e.target.value ? Number(e.target.value) : undefined } }))}
                    placeholder="如：800"
                    className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant mb-2 block">国标行业分类（选填）</label>
                <div className="grid grid-cols-2 gap-3">
                  {([['industry_category','门类'],['industry_major_filled','大类'],['industry_medium','中类'],['industry_minor','小类']] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="text-[10px] text-on-surface-variant/70 mb-1 block">{label}</label>
                      <input value={(confirmDialog.form as any)[key] ?? ''}
                        onChange={e => setConfirmDialog(d => ({ ...d, form: { ...d.form, [key]: e.target.value } }))}
                        placeholder={`国标${label}`}
                        className="w-full px-3 py-2 text-sm bg-surface-container-highest/20 border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary/50" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-outline-variant/10 flex gap-3 justify-end">
              <button onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}
                className="px-5 py-2 text-sm font-bold text-on-surface-variant rounded-lg border border-outline-variant/20 hover:bg-surface-container-highest/20 transition-all">
                取消
              </button>
              <button onClick={handleConfirmSubmit}
                disabled={!confirmDialog.form.credit_code || confirmDialog.isSubmitting}
                className="px-6 py-2 text-sm font-bold bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {confirmDialog.isSubmitting || confirmDialog.geocoding ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{confirmDialog.geocoding ? '地理编码中...' : '入库中...'}</>
                ) : (
                  <><CheckCheck className="w-4 h-4" />确认入库</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
