# 宁波市产业链智能分析平台
## 产品需求文档（PRD）v3.0
### 基于已实现前端同步更新

> **文档说明**：本版本基于已完成的前端代码（React + TypeScript + Tailwind）同步更新，
> 以实际实现为准，描述后端需要对接的真实数据结构与接口需求。
> Cursor / Antigravity 可直接依据本文档搭建后端，无需参考前端源码推断。

---

## 一、技术栈确认（以实际前端为准）

前端已实现，技术栈**不可更改**：

| 层 | 技术 | 版本 |
|---|---|---|
| 框架 | React 19 + TypeScript | `react@^19.0.0` |
| 路由 | React Router DOM | `^7.14.0` |
| 构建 | Vite 6 | `^6.2.0` |
| 样式 | Tailwind CSS v4 | `^4.1.14` |
| 动效 | Framer Motion | `^12.38.0` |
| 图表 | Recharts | `^3.8.1` |
| 图标 | Lucide React | `^0.546.0` |
| AI集成 | @google/genai | `^1.29.0`（当前为Gemini，待评估是否替换） |

后端技术栈（待实现）：

| 层 | 技术 | 版本要求 |
|---|---|---|
| 主框架 | Python + Django + DRF | Django ≥ 4.2 |
| 空间扩展 | GeoDjango + PostGIS | PostGIS ≥ 3.3 |
| ML微服务 | FastAPI | ≥ 0.110 |
| 任务队列 | Celery + Redis | Celery ≥ 5.0 |
| 数据库 | PostgreSQL + PostGIS + pgvector | PG ≥ 15 |

---

## 二、页面架构（以实际路由为准）

```
/           → 重定向到 /map
/map        → 产业地图（IndustryMap）
/chain      → 产业链图谱（ChainGraph）
/transition → 转型看板（Transformation）
/recognize  → 智能识别（Recognition）
/data/*     → 数据管理（DataManagement，含子路由）
```

**全局布局**：

- `Navbar`：顶部固定导航，高度 64px，包含 Logo + 五个页面Tab + 右侧通知铃（待审核企业数量）
- `Sidebar`：左侧固定侧边栏，宽度 288px（w-72），仅在有 `showSidebar=true` 的页面显示
  - **转型看板页**：`showSidebar={false}`，无侧边栏
  - 其余四个页面均有侧边栏
- `Layout`：包裹组件，`main` 区域左边距 `ml-72`（有侧边栏时）

---

## 三、侧边栏筛选项（Sidebar.tsx 实现）

侧边栏内容随当前页面动态变化，分三种模式：

### 3.1 地图页 / 识别页 / 数据管理页（通用筛选模式）

**固定顶部：产业链选择器**

下拉选择，选项：`新能源汽车` / `集成电路` / `生物医药` / `人工智能` / `新材料`

切换产业链时，联动重置链位和节点选择。

**链位选择**（多按钮，互斥单选）

- 新能源汽车 / 集成电路 / 人工智能 / 新材料：`全部` / `上游` / `中游` / `下游`
- 生物医药（特殊）：`全部` / `医药制品` / `医疗器械` / `医疗服务与医药商业`

切换链位时，联动重置节点选择。

**节点选择（多选，带搜索）**

- 节点列表根据 `产业链 × 链位` 级联过滤
- 支持文字搜索过滤
- 多选，显示已选数量，支持"全部取消"
- 节点数据（后端需提供，前端目前硬编码，详见第四章 API 设计）

**地区范围**（单选）：`宁波市` / `浙江省` / `长三角` / `全域`

**企业规模**（多选）：`全部` / `大型` / `中型` / `小微`

**关联强度**（单选）：`全部` / `强` / `较强` / `中`

**空间分析工具**（仅地图页显示，位于侧边栏底部）

四项工具，手风琴展开，**缓冲区和等时圈需要先点选企业才可激活**：

1. **缓冲区分析**：需点选企业 → 显示企业名 + 半径滑块（5-50km）
2. **等时圈分析**：需点选企业 → 显示企业名 + 时间选择（15min/30min/45min/1h）
3. **OD矩阵分析**：无需选企业 → 展示节点间距离矩阵表格
4. **空间自相关（Moran's I）**：无需选企业 → 展示 I 值、p 值、集聚判断

### 3.2 图谱页（ChainGraph 专用模式）

侧边栏仅显示：
- 产业链选择器（共用）
- 链位选择（用于过滤图谱节点）
- **节点大小依据**：`宁波企业数量` / `注册资本均值` / `专利总数` / `综合评分`
- **节点评级说明**（展示用，非交互）：
  - 优势节点（绿色，当前示例3个）：节点名 + 数量占比 + 技术自给率
  - 潜力节点（橙色，当前示例2个）
  - 薄弱/空白节点（红色，当前示例3个）

### 3.3 转型看板页

侧边栏完全隐藏（`showSidebar={false}`）。

---

## 四、各页面详细需求

### 4.1 产业地图页（/map）

**页面顶部工具栏**（地图内左上角）：

四个显示模式互斥切换：`散点图` / `热力图` / `冷热点图` / `OD流向图`

**地图主体**：

- 使用图片占位（现为 `picsum.photos`）
- 后端接入后替换为真实地图（MapboxGL / 高德）
- 企业标记点：按链位染色（上游=primary/蓝，中游=secondary/绿，下游=tertiary/紫）
- 点击企业标记 → 右侧详情面板展开

**地图控制（右上角）**：`+` / `-` / `定位` / `截图`

**右侧企业详情面板**（宽度 w-80，从右侧滑入）：

选中企业后显示：
- 企业名称 + 节点·链位·规模标签
- 关闭按钮（X）
- 4格统计卡：注册资本 / 专利数量 / 参保人数 / 成立年份
- **产业关联性**：总评级（强/较强/中）+ 三维度进度条（上下游覆盖/专利相似度/规模分位）+ 文字说明
- **工商信息**：法定代表人/国标行业/登记状态/所属区县 + [查看完整工商信息] 按钮
- **30km内同链企业**：最多5条，每条显示：企业名/链位标签/关联强度标签，点击可切换选中企业

**[查看完整工商信息] 弹窗（Modal）**：

覆盖全屏，包含：
- 所有基本工商字段（两列网格）：统一社会信用代码/注册资本/实缴资本/成立日期/经营状态/法定代表人/公司类型/人员规模/参保人数/登记机关
- 注册地址（单独一行）
- 经营范围（单独一行）
- 底部确定按钮

**左下图例浮层**：链位颜色图例 + 产业关联性大小图例

**右下缓冲区/等时圈结果浮层**（固定显示）：

显示当前分析范围内的强/较强/中关联企业数量。数量根据缓冲区半径动态计算（目前前端用 `半径 × 系数` 模拟）。

**空间分析叠加层**：
- 缓冲区：圆形虚线圈，大小随半径变化
- 等时圈：不规则多边形轮廓

---

### 4.2 产业链图谱页（/chain）

**图谱区域（主体）**：

三个视图切换（顶部工具栏）：`产业链全景 + 企业网络` / `覆盖密度` / `关系网络`

**流向视图（默认）**：

- 背景：三列虚线分隔（Upstream/Midstream/Downstream 标注）
- 节点：圆形，用颜色和图标区分评级
  - 中心节点（产业链名称）：primary色，Network图标，最大
  - 优势节点：绿色边框 `border-[#1D9E75]`，Check徽标
  - 潜力节点：橙色边框 `border-[#BA7517]`，Zap徽标
  - 薄弱节点：红色边框 `border-error`，AlertTriangle徽标，**虚线边框**
  - 空白节点：灰色边框，无徽标
- 边：SVG线条 + 箭头（markerEnd）
- 点击节点 → 自动切换到"关系网络"视图 + 右侧面板展开

**关系网络视图**（点击节点后自动激活）：

- 力导向图，展示选中节点内的企业关系网络
- 节点=企业，连线=IPC相似度

**覆盖密度视图**：

- 横向条形图，对比宁波/全国各节点企业数量

**右侧节点详情面板**（选中节点后展示）：

- 节点名 + 评级徽标（优势/潜力/薄弱/空白）
- 4格统计：宁波企业数 / 全国占比 / 宁波专利数 / 技术自给率
- 综合评分三维进度条：规模集聚度 / 技术自给率 / 衔接完整度
- 上下游衔接情况
- 招商建议文字
- 宁波代表企业列表（Top5）
- 底部两个按钮：[在地图中查看] → 跳转 `/map` 并传递 `state`（industry/position/node）/ [导出节点报告] → 导出确认弹窗

**跳转到地图逻辑**（已实现）：

```typescript
navigate('/map', {
  state: {
    industry: '新能源汽车',
    position: 'upstream' | 'midstream' | 'downstream' | '全部',
    node: selectedNode.label
  }
})
```

地图页通过 `useLocation().state` 接收并设置初始筛选状态。

---

### 4.3 转型看板页（/transition）

**无侧边栏**，`showSidebar={false}`。

**顶部区域**：

- 页面标题"新能源转型看板"
- 产业链选择器（行内，下拉，仅显示 `is_enabled=true` 的产业链）
- 区县过滤器（下拉：`全部区县` + 各区县列表）
- [导出报告] 按钮 → 导出确认弹窗

**顶部统计卡（4格）**：

企业转型指数 / 宁波新能源专利 / 龙头企业数 / 行业增长率

**主体两列布局**：

左侧（约60%）：转型指数地图（图片占位）
右侧（约40%）：

1. 企业转型排行榜（Top4展示，[查看全部100强] → 弹窗）
2. 专利技术分布（柱状图，可点击某类别 → 专利列表弹窗）

**[查看全部100强] 弹窗**：

全屏弹窗，包含100条企业排行，列：排名/企业名/节点/转型指数/专利数/所属行业。支持搜索。

**[专利技术分布] 点击弹窗**：

展示该IPC分类下的专利列表，列：专利标题/IPC代码/企业名/申请日期/专利类型。支持下载。

---

### 4.4 智能识别页（/recognize）

**两个Tab**：`识别队列`（待审核）/ `已确认`

**识别卡片列表（识别队列Tab）**：

每张卡片包含：
- 企业ID + 企业名 + 状态标签（新增/待定/低置信度）
- 经营范围描述摘要
- Top3识别结果（每个显示：节点标签/置信度分数/颜色条）
- 展开详情区：
  - 企业基本信息（地址/法定代表人/成立日期/统一社会信用代码/经营状态）
  - 候选节点列表（每个节点：节点名/置信度进度条/所属链位）
  - 操作按钮：[确认最优解] / [标记为待定] / [跳转地图]
- 右侧"上链"操作区：从节点列表中选择一个确认入库

**[跳转地图] 按钮**：带节点信息跳转至 `/map`

**已确认Tab**：展示已入库企业列表，样式与识别队列相同但操作按钮变为 [撤销]

**分页**：加载更多（前端已实现：初始24张卡，点击加载更多）

---

### 4.5 数据管理页（/data/*）

**左侧子导航**（垂直Tab）：

- `企业数据库` → `/data/enterprises`（默认）
- `数据导入` → `/data/import`
- `专利语义搜索` → `/data/patent-search`（待实现）
- `数据质量报告` → `/data/quality`（待实现）
- `IPC配置` → `/data/ipc-config`（待实现）

**企业数据库子页**：

筛选区（多行）：
- 搜索框（企业名称模糊搜索）
- 链位下拉 / 产业链下拉 / 节点下拉（级联）
- 省份 / 城市 / 区县（三级联动）
- 企业规模 / 关联强度下拉
- [批量识别] 按钮（跳转 `/recognize`）/ [导出] 按钮（导出确认弹窗）

企业列表表格：

列：企业名称/产业链/节点/链位/数据来源/坐标状态/注册地址/法定代表人/成立日期

操作：点击行 → 展开企业详情侧面板（含基本信息 + [跳转地图] 按钮）

---

## 五、数据类型定义（前端 types.ts，后端必须对齐）

```typescript
// 企业基础类型（前端当前定义）
interface Enterprise {
  id: string;
  name: string;
  chainSegment: 'upstream' | 'midstream' | 'downstream';
  revenue: string;
  dataSource: string;          // '自建' | '企查查'
  reliability: number;         // 0-100
  location: string;            // 区县名
  status?: 'new' | 'pending' | 'verified' | 'anomaly';
  description?: string;        // 经营范围摘要
  valuation?: string;          // 估值，如 '¥42.1亿'
  growthRate?: string;         // 增长率，如 '+12.4%'
}
```

**后端返回字段需在此基础上扩展**，增加以下字段以满足页面展示需求：

```typescript
interface EnterpriseDetail extends Enterprise {
  // 工商信息
  credit_code: string;
  registered_capital: number;      // 万元
  paid_in_capital?: number;
  founded_date: string;            // YYYY-MM-DD
  reg_status: string;              // '存续' | '注销' | ...
  legal_representative: string;
  org_type: string;
  insured_employees: number;
  reg_authority: string;
  registered_address: string;
  business_scope: string;

  // 产业链信息
  industry_chain: string;
  chain_node: string;
  chain_position: 'upstream' | 'midstream' | 'downstream';

  // 分析结果
  association_level: '强' | '较强' | '中';
  association_score: number;        // 0-100
  coverage_score: number;           // 上下游覆盖，0-100
  patent_similarity_score: number;  // 专利相似度，0-100
  scale_percentile: number;         // 规模分位，0-100
  patent_count: number;
  is_listed: boolean;

  // 坐标
  lat?: number;
  lng?: number;
  geo_status: 'done' | 'pending' | 'failed';
}
```

---

## 六、后端 API 接口设计

所有接口前缀 `/api/v1/`，统一响应格式：

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "pagination": { "page": 1, "page_size": 20, "total": 1000 }
}
```

### 6.1 企业接口

#### `GET /enterprises/`

列表查询，支持以下参数：

```
industry_chain      产业链名称
chain_node          节点名称（支持逗号分隔多值）
chain_position      upstream | midstream | downstream
region_scope        宁波市 | 浙江省 | 长三角 | 全域
province            省份
city                城市
district            区县
enterprise_scale    大型 | 中型 | 小微
association_level   强 | 较强 | 中
keyword             模糊搜索（名称）
data_source         qichacha | custom
geo_status          done | pending | failed
bbox                minLng,minLat,maxLng,maxLat（地图视口过滤）
page                页码（默认1）
page_size           每页数量（默认20，上限100）
ordering            排序字段（-registered_capital 等）
```

返回 `EnterpriseDetail[]`。

#### `GET /enterprises/{id}/`

返回完整企业详情（含所有字段）。

#### `GET /enterprises/{id}/nearby/`

返回指定企业缓冲区内的同链企业，参数：`radius_km`（默认30）。

返回格式：
```json
{
  "data": {
    "center": { "name": "宁波A", "lng": 121.55, "lat": 29.87 },
    "radius_km": 30,
    "results": [
      {
        "name": "宁波B",
        "chain_node": "负极材料",
        "chain_position": "upstream",
        "association_level": "强",
        "distance_km": 12.4
      }
    ],
    "summary": { "强": 24, "较强": 19, "中": 15 }
  }
}
```

#### `GET /enterprises/map-points/`

地图散点数据（轻量），必须附带 `bbox` 参数，返回最小字段集：

```json
{
  "data": [
    {
      "id": 123,
      "name": "宁波A",
      "lat": 29.87,
      "lng": 121.55,
      "chain_position": "upstream",
      "association_level": "强"
    }
  ]
}
```

#### `GET /enterprises/business-info/{id}/`

工商信息弹窗专用接口，返回完整工商字段。

### 6.2 产业链节点接口

#### `GET /chain/nodes/`

返回产业链节点定义，用于侧边栏级联选择器和图谱渲染。

参数：`industry_chain`（必填）

```json
{
  "data": {
    "industry_chain": "新能源汽车",
    "positions": {
      "上游": ["正极材料", "负极材料", "电解液", "隔膜", "锂矿加工", "铜箔/铝箔"],
      "中游": ["电芯", "PACK", "BMS", "驱动电机", "电控系统", "热管理系统"],
      "下游": ["乘用车", "商用车", "特种车", "充电桩", "换电站", "电池回收"]
    }
  }
}
```

**注意**：生物医药的链位分类不同，需特殊处理：

```json
{
  "industry_chain": "生物医药",
  "positions": {
    "医药制品": ["化学药", "生物药", "中药", ...],
    "医疗器械": [...],
    "医疗服务与医药商业": [...]
  }
}
```

#### `GET /chain/graph/`

图谱数据，参数：`industry_chain`

```json
{
  "data": {
    "nodes": [
      {
        "id": "cathode",
        "label": "正极材料",
        "type": "upstream",
        "status": "advantage",
        "ningbo_count": 12,
        "national_count": 280,
        "scale_score": 72.4,
        "tech_score": 58.1,
        "linkage_score": 75.0,
        "node_level": "优势节点",
        "count_ratio_pct": 8.2
      }
    ],
    "edges": [
      { "source": "cathode", "target": "cell" }
    ]
  }
}
```

#### `GET /chain/node-detail/{node_name}/`

节点详情，参数：`industry_chain`

```json
{
  "data": {
    "node_name": "正极材料",
    "chain_position": "上游",
    "node_level": "优势节点",
    "ningbo_count": 12,
    "national_count": 280,
    "count_ratio_pct": 8.2,
    "ningbo_patents": 134,
    "tech_self_rate": 58.1,
    "scale_score": 72.4,
    "tech_score": 58.1,
    "linkage_score": 75.0,
    "upstream_nodes": [{ "name": "锂矿采选", "status": "空白节点" }],
    "downstream_nodes": [{ "name": "电芯制造", "status": "潜力节点", "ningbo_count": 3 }],
    "od_distances": { "电芯制造": 18.2 },
    "suggestion": "上游锂矿采选为空白节点，建议重点引进碳酸锂加工企业",
    "top_enterprises": [
      { "id": 1, "name": "宁波A新能源", "is_listed": true, "patent_count": 34 }
    ]
  }
}
```

#### `GET /chain/enterprise-network/`

节点内企业相似度网络（力导向图数据），参数：`industry_chain` + `chain_node`

```json
{
  "data": {
    "nodes": [
      { "id": 1, "name": "宁波A", "registered_capital": 86.3, "patent_count": 34, "is_listed": true }
    ],
    "edges": [
      { "source": 1, "target": 4, "similarity": 0.82 }
    ]
  }
}
```

### 6.3 空间分析接口

#### `POST /spatial/buffer/`

```json
// 请求
{
  "enterprise_id": 123,
  "radius_km": 30,
  "industry_chain": "新能源汽车"
}
// 响应（同 /enterprises/{id}/nearby/）
```

#### `POST /spatial/isochrone/`

```json
// 请求
{
  "enterprise_id": 123,
  "time": "30min"
}
// 响应
{
  "data": {
    "polygon": [[lng, lat], ...],  // 等时圈多边形坐标
    "enterprise_count": 45,
    "summary": { "强": 18, "较强": 15, "中": 12 }
  }
}
```

#### `GET /spatial/od-matrix/`

参数：`industry_chain`

```json
{
  "data": {
    "from_nodes": ["正极材料", "负极材料", "BMS"],
    "to_nodes": ["电芯制造", "PACK集成", "整车制造"],
    "matrix": [[18.2, 34.5, 87.1], [42.3, 39.1, 94.2], [22.1, 15.3, 51.4]],
    "unit": "km",
    "thresholds": { "green": 30, "orange": 60 }
  }
}
```

#### `GET /spatial/moran/`

参数：`industry_chain` + `chain_node`（可选）

```json
{
  "data": {
    "moran_i": 0.431,
    "p_value": 0.003,
    "z_score": 4.21,
    "interpretation": "显著正相关",
    "conclusion": "企业存在显著空间集聚",
    "node_name": "正极材料"
  }
}
```

### 6.4 转型分析接口

#### `GET /transition/dashboard/`

参数：`industry_chain` + `district`（可选）

```json
{
  "data": {
    "metrics": {
      "transition_index": 62.4,
      "nev_patents": 1842,
      "leading_enterprises": 23,
      "industry_growth_rate": "+12.4%"
    },
    "ranking": [
      {
        "rank": 1,
        "name": "阳光电源（宁波）科技",
        "sector": "光伏系统解决方案",
        "score": 98.4,
        "change": "+2.1%",
        "node": "光伏逆变器",
        "patents": 156
      }
    ],
    "patent_distribution": [
      { "category": "动力电池", "ipc_prefix": "H01M", "count": 342 },
      { "category": "驱动电机", "ipc_prefix": "H02K", "count": 156 }
    ]
  }
}
```

#### `GET /transition/enterprises/`

全部企业排行，支持搜索：参数 `keyword` + `industry_chain` + `district`，返回最多100条。

#### `GET /transition/patents/`

专利列表，参数：`ipc_prefix` + `industry_chain` + `enterprise_id`（可选）

```json
{
  "data": [
    {
      "id": 1,
      "title": "一种高能量密度动力电池组及其热管理系统",
      "ipc": "H01M 10/613",
      "company": "宁波某科技",
      "date": "2025-03-15",
      "type": "发明专利"
    }
  ]
}
```

### 6.5 智能识别接口

#### `GET /recognize/queue/`

待审核识别结果队列，参数：`page` + `page_size`（默认24）

```json
{
  "data": [
    {
      "id": "NB-882941-X",
      "name": "宁波光电技术解决方案有限公司",
      "tag": "新增",
      "business_scope_excerpt": "专业从事半导体用蓝宝石晶体衬底的开发及精密光学镀膜...",
      "top3_results": [
        { "label": "上游：半导体材料", "score": 94, "chain": "集成电路", "node": "半导体材料", "position": "upstream" },
        { "label": "中游：光学组件", "score": 42, "chain": "集成电路", "node": "光学组件", "position": "midstream" },
        { "label": "下游：消费电子", "score": 12, "chain": "集成电路", "node": "消费电子", "position": "downstream" }
      ],
      "detail": {
        "address": "宁波市鄞州区科技园区光电大道88号",
        "legal_representative": "张光远",
        "founded_date": "2015-06-12",
        "credit_code": "91330212MA281X8829",
        "reg_status": "存续",
        "candidate_nodes": [
          { "node": "正极材料", "score": 98, "position": "上游" },
          { "node": "负极材料", "score": 92, "position": "上游" }
        ]
      }
    }
  ],
  "pagination": { "page": 1, "page_size": 24, "total": 47 }
}
```

**tag 取值**：`新增`（新识别未处理）/ `待定`（用户标记）/ `低置信度`（最高置信度<0.7）

#### `POST /recognize/confirm/`

确认识别结果并入库。

```json
// 请求
{ "recognition_id": "NB-882941-X", "confirmed_node": "正极材料", "confirmed_position": "upstream" }
// 响应
{ "code": 200, "data": { "enterprise_id": 456 } }
```

#### `PUT /recognize/{id}/tag/`

标记状态（待定/撤销）。

```json
{ "tag": "待定" }
```

#### `GET /recognize/confirmed/`

已确认入库的企业列表（格式同 queue）。

#### `POST /recognize/single/`

单条识别（ML微服务）。

```json
// 请求
{
  "name": "宁波某新能源科技有限公司",
  "credit_code": "91330200XXXXXXXXXX",
  "business_scope": "新能源汽车动力电池正极材料的研发、生产与销售...",
  "ipc_codes": ["H01M4/36"]
}
// 响应
{
  "data": {
    "result_id": "NB-TEMP-001",
    "has_patent_signal": true,
    "candidates": [
      { "rank": 1, "chain": "新能源汽车", "node": "正极材料", "position": "upstream", "confidence": 0.91 }
    ],
    "needs_review": false
  }
}
```

#### `POST /recognize/batch/`

批量识别，上传Excel文件（multipart），返回 `task_id`。

#### `GET /recognize/task/{task_id}/`

查询批量任务进度：`{ "status": "processing", "done": 240, "total": 500 }`

### 6.6 数据管理接口

#### `GET /data/enterprises/`

同 `GET /enterprises/`，但增加管理字段：`data_source` / `geo_status`。

#### `GET /data/enterprises/export/`

导出Excel，返回文件流。

#### `POST /data/import/`

导入Excel，multipart上传，返回 `task_id`。

#### `GET /data/quality/`

数据质量报告：各数据源数量/坐标化率/专利覆盖率/节点标签覆盖率。

---

## 七、后端业务逻辑（简要）

以下逻辑前端无法自行完成，必须由后端实现：

### 7.1 产业链节点定义

节点列表（侧边栏、图谱所需）应从数据库 `chain_node_definition` 表查询，不得硬编码。前端当前已硬编码节点数据，接入后端后需替换为 API 调用。

### 7.2 节点评级计算

见 PRD v2.0 第9章，三维评级（规模集聚度/技术自给率/衔接完整度），结果缓存到物化视图 `mv_chain_node_stats`。

### 7.3 产业关联性计算

见 PRD v2.0 第8章，三维加权（上下游覆盖50% + 专利相似度30% + 规模分位20%），写入 `enterprise.association_level`。

### 7.4 转型指数计算

见 PRD v2.0 第11章，三子指标（深度50% + 速度30% + 厚度20%），依赖 `patent` 表和 `strategic_industry_ipc` 表。

### 7.5 空间分析

- 缓冲区：PostGIS `ST_DWithin`
- OD矩阵：各节点企业坐标质心间的 `ST_Distance`
- Moran's I：Python PySAL 库计算，结果缓存 Redis

### 7.6 智能识别引擎

FastAPI 微服务，见 PRD v2.0 第7章，BERT + IPC亲和度双信号融合。

---

## 八、数据库设计（同 PRD v2.0，关键表简列）

```sql
-- 企业主表（分区）
enterprise  PARTITION BY LIST (is_ningbo)
  → enterprise_ningbo   (is_ningbo=true)
  → enterprise_national (is_ningbo=false)

-- 专利子表
patent (enterprise_id, ipc_codes[], abstract_vector vector(768), is_nev_related, nev_tech_domain)

-- 产业链定义
chain_node_definition (industry_chain, node_name, node_level, node_order)
chain_node_relation   (industry_chain, from_node, to_node, relation_type)
node_ipc_mapping      (industry_chain, node_name, ipc_code, weight)
strategic_industry_ipc(industry_name, ipc_subclass)

-- 识别结果
recognition_result (input_*, confidence_*, status, confirmed_chain, confirmed_node)

-- 转型指数
nev_transition_score (enterprise_id, transition_score, score_level, depth_score, ...)
transition_analysis_config (industry_chain, transition_ipc[], is_enabled)

-- 物化视图（每日刷新）
mv_chain_node_stats
mv_transition_summary
mv_ningbo_district_stats
```

---

## 九、已移除 / 降级的功能（对比 PRD v2.0）

以下功能在前端实现中未出现，**后端暂不需要实现**，待后续迭代：

| PRD v2.0 功能 | 前端状态 | 后端处理 |
|---|---|---|
| 集聚度计算（NNI指数） | 未实现 | 暂不需要 |
| 冷热点分析（Getis-Ord Gi*）完整计算 | 前端仅做视觉效果 | 接口预留，不优先 |
| 专利语义搜索独立页面 | 数据管理子页预留入口，未实现 | 第二期实现 |
| 数据质量报告页 | 数据管理子页预留入口，未实现 | 第二期实现 |
| IPC配置管理页 | 数据管理子页预留入口，未实现 | 第二期实现 |
| Pinia 状态管理 | 使用 React 本地 state（非 Pinia） | 不涉及后端 |
| MapboxGL 真实地图 | 图片占位 | 第二期集成 |

---

## 十、前端与后端对接注意事项

### 10.1 跨页面跳转传参

图谱页跳转地图页，通过 `react-router-dom` 的 `navigate(path, { state })` 传参。
地图页通过 `useLocation().state` 接收并初始化侧边栏筛选状态。
**后端无需处理，纯前端路由**。

### 10.2 通知铃待审核数量

Navbar 右上角通知铃显示待审核企业数量。
需要接口：`GET /recognize/pending-count/` → `{ "count": 24 }`。

### 10.3 数据来源标注

前端展示 `dataSource` 字段，取值为 `'自建'` 或 `'企查查'`。
后端 `data_source` 字段取值为 `qichacha` / `nev_custom` / `ningbo_patent`，
序列化时映射：`qichacha → 企查查`，其余 → `自建`。

### 10.4 企业规模映射

前端侧边栏：`大型 / 中型 / 小微`
后端数据库：`大型 / 中型 / 小型 / 微型`
API 筛选参数 `enterprise_scale=小微` 时，后端查询 `小型 OR 微型`。

### 10.5 可信度（reliability）字段

前端 `Enterprise.reliability` 为 0-100 的数字，对应企业数据完整度/可信度评分。
后端根据以下规则计算：有坐标+50，有专利+20，有完整工商信息+20，数据来源企查查+10。

---

*文档版本：v3.0 | 2026-04-09*
*基于前端实现代码同步更新*
*前端：React 19 + TypeScript + Tailwind CSS v4*
*后端：待实现（Django + PostGIS + FastAPI）*
