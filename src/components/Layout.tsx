import { ReactNode } from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarProps?: any;
}

export default function Layout({ children, showSidebar = true, sidebarProps }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Navbar />
      <div className="pt-16 flex flex-col min-h-screen">
        <div className="flex flex-1">
          {showSidebar && <Sidebar {...sidebarProps} />}
          <main className={showSidebar ? "ml-72 flex-1 p-8 overflow-y-auto" : "flex-1 p-8 overflow-y-auto"}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
