import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { MapPoint } from '../api/enterprises';

const POSITION_COLORS: Record<string, string> = {
  upstream: '#2ddbde',
  midstream: '#78dc77',
  downstream: '#f9abff',
};

interface AMapComponentProps {
  mapPoints: MapPoint[];
  viewMode: 'scatter' | 'heat' | 'coldhot' | 'odflow';
  activeTool: string | null;
  bufferRadius: number;
  selectedEnterprise: any | null;
  onSelectEnterprise: (point: MapPoint) => void;
  // 热力图参数
  heatRadius?: number;
  heatGradient?: string;
}

// NOTE: 热力图渐变色板预设， key 与 IndustryMap 中的 HEAT_GRADIENTS 保持一致
export const HEAT_GRADIENT_PRESETS: Record<string, Record<number, string>> = {
  cyan:   { 0.0: 'rgba(45,219,222,0)', 0.2: 'rgba(45,219,222,0.6)', 0.5: 'rgba(120,220,119,0.85)', 0.75: 'rgba(200,255,120,0.95)', 1.0: 'rgba(255,255,200,1)' },
  fire:   { 0.0: 'rgba(0,0,0,0)', 0.2: 'rgba(255,120,0,0.6)', 0.5: 'rgba(255,50,0,0.85)', 0.75: 'rgba(255,200,0,0.95)', 1.0: 'rgba(255,255,220,1)' },
  purple: { 0.0: 'rgba(100,0,180,0)', 0.3: 'rgba(100,0,180,0.6)', 0.6: 'rgba(45,100,220,0.85)', 0.85: 'rgba(45,219,222,0.95)', 1.0: 'rgba(200,240,255,1)' },
  gold:   { 0.0: 'rgba(20,5,0,0)', 0.2: 'rgba(200,70,0,0.6)', 0.5: 'rgba(220,150,0,0.85)', 0.75: 'rgba(255,220,60,0.95)', 1.0: 'rgba(255,255,210,1)' },
};

export interface AMapComponentRef {
  showBuffer: (center: [number, number], radiusKm: number) => void;
  showIsochrone: (polygon: [number, number][]) => void;
  clearOverlays: () => void;
}

/**
 * 动态加载高德地图 JS SDK 并等待可用
 * NOTE: Key 从 Vite 环境变量 VITE_AMAP_KEY 读取（JS API Key，与 Web Service Key 不同）
 */
function loadAmapScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).AMap) {
      resolve();
      return;
    }

    const key = import.meta.env.VITE_AMAP_KEY;
    if (!key || key === 'your_amap_key_here') {
      console.warn('[AMap] 未配置 VITE_AMAP_KEY，地图功能将不可用。请在 .env 文件中填写高德地图 API Key。');
      reject(new Error('AMAP_KEY_NOT_SET'));
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${key}&plugin=AMap.HeatMap,AMap.Circle,AMap.Polygon,AMap.MarkerCluster`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('AMap SDK load failed'));
    document.head.appendChild(script);
  });
}

const AMapComponent = forwardRef<AMapComponentRef, AMapComponentProps>(
  ({ mapPoints, viewMode, activeTool, bufferRadius, selectedEnterprise, onSelectEnterprise, heatRadius = 35, heatGradient = 'cyan' }, ref) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const overlaysRef = useRef<any[]>([]);
    const heatmapRef = useRef<any>(null);
    const loadedRef = useRef(false);
    // NOTE: 用于解决地图异步初始化与数据加载之间的竞态问题
    // 地图初始化完成后置为 true，触发 mapPoints 渲染 useEffect 重新执行
    const [mapReady, setMapReady] = useState(false);

    useImperativeHandle(ref, () => ({
      showBuffer: (center: [number, number], radiusKm: number) => {
        if (!mapRef.current) return;
        clearAllOverlays();
        const circle = new (window as any).AMap.Circle({
          center: new (window as any).AMap.LngLat(center[0], center[1]),
          radius: radiusKm * 1000,
          strokeColor: '#2ddbde',
          strokeWeight: 2,
          strokeOpacity: 0.8,
          strokeStyle: 'dashed',
          fillColor: '#1de2e5',
          fillOpacity: 0.1,
        });
        circle.setMap(mapRef.current);
        overlaysRef.current.push(circle);
        mapRef.current.setFitView([circle]);
      },

      showIsochrone: (polygon: [number, number][]) => {
        if (!mapRef.current) return;
        clearAllOverlays();

        // NOTE: 高德 AMap.Polygon 接受 LngLat 数组，顺序为经度、纬度
        const path = polygon.map(([lng, lat]) => new (window as any).AMap.LngLat(lng, lat));

        const isoPolygon = new (window as any).AMap.Polygon({
          path,
          strokeColor: '#78dc77',
          strokeWeight: 2,
          strokeOpacity: 0.9,
          strokeStyle: 'solid',
          fillColor: '#78dc77',
          fillOpacity: 0.12,
        });

        isoPolygon.setMap(mapRef.current);
        overlaysRef.current.push(isoPolygon);
        mapRef.current.setFitView([isoPolygon]);
      },

      clearOverlays: clearAllOverlays,
    }));

    function clearAllOverlays() {
      overlaysRef.current.forEach(o => o.setMap(null));
      overlaysRef.current = [];
    }

    // 初始化地图（仅执行一次）
    useEffect(() => {
      if (loadedRef.current) return;
      loadedRef.current = true;

      loadAmapScript()
        .then(() => {
          if (!mapContainerRef.current) return;
          const map = new (window as any).AMap.Map(mapContainerRef.current, {
            viewMode: '2D',
            zoom: 10,
            center: [121.55, 29.87], // 宁波市中心
            mapStyle: 'amap://styles/dark',
            resizeEnable: true,
          });

          // 热力图插件初始化
          (window as any).AMap.plugin(['AMap.HeatMap'], () => {
            heatmapRef.current = new (window as any).AMap.HeatMap(map, {
              // NOTE: radius 为每个数据点的扩散半径（像素）——宁波企业密度高，35能让热區更连续
              radius: 35,
              // NOTE: 透明度范围 [最小透明度, 最大透明度]，保留较低透明度避免淹没背景
              opacity: [0, 0.85],
              visible: false,
              // NOTE: 渐变色板与平台配色一致：透明→青色（主色）→翠绿（次要色）→白色（最高密度）
              gradient: {
                0.0: 'rgba(45,219,222,0)',
                0.2: 'rgba(45,219,222,0.6)',
                0.5: 'rgba(120,220,119,0.85)',
                0.75: 'rgba(200,255,120,0.95)',
                1.0: 'rgba(255,255,200,1)',
              },
            });
          });

          mapRef.current = map;
          // NOTE: 通知 React 地图已就绪，触发落点渲染 useEffect 重新执行
          setMapReady(true);
        })
        .catch((err) => {
          if (err.message === 'AMAP_KEY_NOT_SET') {
            if (mapContainerRef.current) {
              mapContainerRef.current.innerHTML = `
                <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1117;color:#aaa;gap:12px;">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2ddbde" stroke-width="1.5">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  <p style="font-size:14px;font-weight:600;color:#e0e0e0;">高德地图未配置</p>
                  <p style="font-size:12px;text-align:center;max-width:260px;">请在项目根目录的 <code style="color:#2ddbde;background:#1a2a2a;padding:2px 6px;border-radius:4px;">.env</code> 文件中设置：<br/>
                  <code style="color:#78dc77;background:#1a2a2a;padding:4px 8px;border-radius:4px;margin-top:8px;display:block;">VITE_AMAP_KEY=您的高德 JS API Key</code></p>
                </div>
              `;
            }
          }
        });
    }, []);

    // 根据 mapPoints 和 viewMode 动态渲染覆盖物
    // NOTE: mapReady 作为依赖项，确保地图初始化完成后（即使 mapPoints 已先到达）也能触发渲染
    useEffect(() => {
      if (!mapRef.current || !mapReady) return;

      markersRef.current.forEach(m => mapRef.current.remove(m));
      markersRef.current = [];
      if (heatmapRef.current) heatmapRef.current.hide();

      if (viewMode === 'heat') {
        if (heatmapRef.current && mapPoints.length > 0) {
          // NOTE: 每次渲染前先更新半径和渐变色，实现 UI 控制实时 preview
          const gradient = HEAT_GRADIENT_PRESETS[heatGradient] ?? HEAT_GRADIENT_PRESETS.cyan;
          heatmapRef.current.setOptions({ radius: heatRadius, gradient });

          const WEIGHT: Record<string, number> = { '强': 3, '较强': 2, '中': 1 };
          const data = mapPoints.map(p => ({
            lng: p.lng,
            lat: p.lat,
            count: WEIGHT[p.association_level] ?? 1,
          }));
          heatmapRef.current.setDataSet({ data, max: 6 });
          heatmapRef.current.show();
        }
        return;
      }


      // NOTE: 按关联强度映射标记点大小，与图例保持一致
      // 强=大圆(实心), 较强=中圆, 中=小圆
      const ASSOC_SIZE: Record<string, number> = {
        '强': 18,
        '较强': 13,
        '中': 9,
      };

      // 散点图模式：渲染企业标记点
      const markers = mapPoints.map(point => {
        const color = POSITION_COLORS[point.chain_position] || '#aaaaaa';
        const size = ASSOC_SIZE[point.association_level] ?? 11;
        const half = Math.floor(size / 2);
        const content = `<div style="
          width:${size}px;height:${size}px;
          background:${color};
          border-radius:50%;
          border:${size >= 15 ? 2 : 1.5}px solid rgba(255,255,255,0.5);
          box-shadow:0 0 ${size >= 15 ? 12 : 6}px ${color};
          cursor:pointer;
        "></div>`;

        const marker = new (window as any).AMap.Marker({
          position: [point.lng, point.lat],
          content,
          offset: new (window as any).AMap.Pixel(-half, -half),
          extData: point,
          zIndex: size >= 15 ? 120 : size >= 12 ? 110 : 100,  // 强关联点浮在最上层
        });

        marker.on('click', () => onSelectEnterprise(point));
        mapRef.current.add(marker);
        return marker;
      });

      markersRef.current = markers;
    }, [mapPoints, viewMode, mapReady, heatRadius, heatGradient]);

    // 当选中企业时地图切换到该企业位置
    useEffect(() => {
      if (!mapRef.current || !selectedEnterprise?.lng || !selectedEnterprise?.lat) return;
      mapRef.current.setZoomAndCenter(14, [selectedEnterprise.lng, selectedEnterprise.lat]);
    }, [selectedEnterprise]);

    return (
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: '#0d1117' }}
      />
    );
  }
);

AMapComponent.displayName = 'AMapComponent';
export default AMapComponent;
