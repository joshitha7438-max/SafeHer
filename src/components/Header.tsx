import { User } from 'firebase/auth';
import { AlertOctagon } from 'lucide-react';
import { AppTab } from '../types/safeher';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  user: User | null;
  onTriggerSos: () => void;
  onSignIn: () => void;
  activeSosCount: number;
}

const NAV_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'planner', label: 'Route Planner' },
  { id: 'journey', label: 'Live Journey' },
  { id: 'report', label: 'Report Hazard' },
  { id: 'police', label: 'Police Dispatch' },
];

export function Header({
  activeTab,
  onSelectTab,
  user,
  onTriggerSos,
  onSignIn,
  activeSosCount,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('planner')}
          className="font-display text-xl font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded"
        >
          SafeHer
        </button>

        {/* Zone 2: Clean Typography Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const showCount = item.id === 'police' && activeSosCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded ${
                  isActive
                    ? 'text-teal-700'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                <span>{item.label}</span>
                {showCount && (
                  <span className="ml-1.5 font-mono text-xs font-semibold text-red-600 tabular-nums">
                    ({activeSosCount})
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-teal-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onTriggerSos}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            >
              <AlertOctagon className="w-4 h-4 shrink-0" />
              <span>Emergency SOS</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </div>

      {/* Compact Mobile Navigation Row */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center justify-between border-t border-slate-100 px-3 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`py-2.5 px-2.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                isActive
                  ? 'border-teal-700 text-teal-700'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
