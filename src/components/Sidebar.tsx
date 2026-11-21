import {
  Activity,
  ChevronRight,
  HelpCircle,
  LayoutGrid,
  LineChart,
  Phone,
  Settings,
  Store,
  UserCircle2,
  Users,
} from 'lucide-react';
import type { AuthUser } from '../types/retail.ts';

export type NavSection =
  | 'Overview'
  | 'Stores'
  | 'Insights'
  | 'Traffic'
  | 'Staff'
  | 'Queue'
  | 'Settings'
  | 'Help';

interface SidebarProps {
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  onOpenAccount: () => void;
  currentUser: AuthUser | null;
}

const MENU_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutGrid }> = [
  { id: 'Overview', label: 'Overview', icon: LayoutGrid },
  { id: 'Stores', label: 'Stores', icon: Store },
  { id: 'Insights', label: 'Insights', icon: LineChart },
  { id: 'Traffic', label: 'Traffic', icon: Activity },
  { id: 'Staff', label: 'Staff', icon: UserCircle2 },
  { id: 'Queue', label: 'Queue', icon: Users },
];

const OTHER_ITEMS: Array<{ id: NavSection; label: string; icon: typeof Settings }> = [
  { id: 'Settings', label: 'Settings', icon: Settings },
  { id: 'Help', label: 'Help', icon: Phone },
];

export function Sidebar({
  activeNav,
  onSelectNav,
  onOpenAccount,
  currentUser,
}: SidebarProps) {
  return (
    <aside
      className="relative w-[216px] shrink-0 flex flex-col justify-between px-4 py-6 select-none overflow-hidden border-r border-[#EBEEF2]/80"
      style={{
        background:
          'linear-gradient(160deg, #E8F1FC 0%, #F3F6FA 42%, #F6F7FA 100%)',
      }}
    >
      {/* Subtle geometric background watermark matching reference */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-8 bottom-14 opacity-[0.045]"
      >
        <svg width="220" height="220" viewBox="0 0 120 120" fill="none">
          <rect x="10" y="10" width="38" height="38" rx="4" fill="#94A3B8" />
          <rect x="72" y="10" width="38" height="38" rx="4" fill="#94A3B8" />
          <rect x="41" y="41" width="38" height="38" rx="4" fill="#94A3B8" />
          <rect x="10" y="72" width="38" height="38" rx="4" fill="#94A3B8" />
          <rect x="72" y="72" width="38" height="38" rx="4" fill="#94A3B8" />
        </svg>
      </div>

      <div className="relative z-10">
        {/* Brand Lockup */}
        <div className="flex items-center gap-2.5 px-2.5 mb-7">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect x="2" y="2" width="7.5" height="7.5" rx="1.8" fill="#3B82F6" />
            <rect x="14.5" y="2" width="7.5" height="7.5" rx="1.8" fill="#2563EB" />
            <rect x="8.25" y="8.25" width="7.5" height="7.5" rx="1.5" fill="#1D4ED8" />
            <rect x="2" y="14.5" width="7.5" height="7.5" rx="1.8" fill="#2563EB" />
            <rect x="14.5" y="14.5" width="7.5" height="7.5" rx="1.8" fill="#60A5FA" />
          </svg>
          <span className="text-[18px] font-bold tracking-[-0.025em] text-[#111827] whitespace-nowrap">
            Retail Insight
          </span>
        </div>

        {/* Menu Group */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-medium text-[#6B7280]">
            Menu
          </div>
          <nav className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-[#111827] font-semibold shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
                      : 'text-[#4B5563] font-medium hover:bg-white/60 hover:text-[#111827]'
                  }`}
                >
                  <Icon
                    className={`w-[17px] h-[17px] shrink-0 ${
                      isActive ? 'text-[#111827]' : 'text-[#6B7280]'
                    }`}
                    strokeWidth={1.85}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Others Group */}
        <div className="mt-7">
          <div className="px-3 mb-2 text-[11px] font-medium text-[#6B7280]">
            Others
          </div>
          <nav className="space-y-1">
            {OTHER_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-[#111827] font-semibold shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
                      : 'text-[#4B5563] font-medium hover:bg-white/60 hover:text-[#111827]'
                  }`}
                >
                  <Icon
                    className={`w-[17px] h-[17px] shrink-0 ${
                      isActive ? 'text-[#111827]' : 'text-[#6B7280]'
                    }`}
                    strokeWidth={1.85}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom User Profile */}
      <button
        type="button"
        onClick={onOpenAccount}
        className="relative z-10 w-full flex items-center gap-2.5 px-2 py-2 rounded-[12px] hover:bg-white/70 transition-colors text-left"
        title="Manage Operator Sign-In & Auth Session"
      >
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D1D5DB] to-[#9CA3AF] overflow-hidden flex items-center justify-center ring-2 ring-white shadow-sm">
            {/* Clean illustrated portrait matching reference user avatar */}
            <svg viewBox="0 0 36 36" className="w-full h-full">
              <rect width="36" height="36" fill="#E5E7EB" />
              <circle cx="18" cy="14" r="7.5" fill="#78350F" />
              <circle cx="18" cy="15" r="6" fill="#FDE68A" opacity="0.95" />
              <path d="M12 13 C12 8, 24 8, 24 13 C22 10, 14 10, 12 13Z" fill="#78350F" />
              <path d="M7 36 C7 26, 29 26, 29 36 Z" fill="#1F2937" />
              <circle cx="15.8" cy="14.8" r="0.8" fill="#1F2937" />
              <circle cx="20.2" cy="14.8" r="0.8" fill="#1F2937" />
              <path d="M16.2 17.5 Q18 19 19.8 17.5" stroke="#B45309" strokeWidth="1" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-[3px] bg-[#DC2626] border border-white flex items-center justify-center text-[6px] font-bold text-white leading-none"
            aria-hidden="true"
          >
            UQ
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[#111827] truncate leading-tight">
            {currentUser?.name || 'Riana davidson'}
          </div>
          <div className="text-[11px] text-[#6B7280] truncate leading-tight mt-0.5">
            {currentUser?.email || 'riana@uniqlo.jp'}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-[#6B7280] shrink-0" />
      </button>
    </aside>
  );
}
