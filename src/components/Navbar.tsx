import { Bell } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/src/lib/utils';

const navItems = [
  { name: '产业地图', path: '/map' },
  { name: '产业链图谱', path: '/chain' },
  { name: '转型看板', path: '/transition' },
  { name: '智能识别', path: '/recognize' },
  { name: '数据管理', path: '/data' },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-slate-950/80 backdrop-blur-xl bg-gradient-to-b from-slate-900 to-transparent border-b border-outline-variant/10">
      <div className="flex items-center gap-8">
        <span className="text-xl font-bold tracking-tighter text-primary font-headline">宁波市产业链智能分析平台</span>
        <div className="hidden md:flex gap-6 items-center">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "text-sm font-medium transition-colors pb-1",
                location.pathname === item.path
                  ? "text-primary border-b-2 border-primary"
                  : "text-on-surface-variant hover:text-primary"
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link 
          to="/recognize" 
          className="text-on-surface-variant hover:text-primary transition-colors p-2 relative group"
          title="待审核企业"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border border-slate-900 animate-pulse"></span>
          
          {/* Tooltip/Badge count on hover */}
          <div className="absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-surface-container-highest text-on-surface text-[10px] font-bold px-2 py-1 rounded shadow-xl border border-outline-variant/10 whitespace-nowrap">
              24 条待审核任务
            </div>
          </div>
        </Link>
      </div>
    </nav>
  );
}
