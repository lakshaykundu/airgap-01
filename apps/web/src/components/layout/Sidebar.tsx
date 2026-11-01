import { ChevronsLeft, ChevronsRight, Database, TerminalSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { NavLink } from 'react-router';
import { usePendingCount } from '../../hooks/useLiveData';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions } from '../../store/uiSlice';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { NAV_ITEMS } from './nav';

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pending = usePendingCount();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 px-2">
      {NAV_ITEMS.map((item) => {
        const link = (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors',
                isActive ? 'bg-elevated text-fg' : 'text-fg-2 hover:bg-hover/60 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-primary shadow-[0_0_10px_rgba(36,229,192,0.8)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-primary' : 'text-fg-3 group-hover:text-fg-2',
                  )}
                  aria-hidden
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.to === '/sync' && pending > 0 && (
                  <span className="ml-auto rounded-md bg-accent/15 px-1.5 font-mono text-[10px] text-[#b7a6ff]">
                    {pending}
                  </span>
                )}
                {collapsed && <span className="sr-only">{item.label}</span>}
              </>
            )}
          </NavLink>
        );
        return collapsed ? (
          <Tooltip key={item.to} content={item.label} side="right">
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const consoleOpen = useAppSelector((state) => state.ui.devConsoleOpen);
  const dispatch = useAppDispatch();
  return (
    <motion.aside
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-line/70 bg-surface/40 py-4 lg:flex"
      // initial={false}: start at the final width, so mounting never shifts the main column.
      initial={false}
      animate={{ width: collapsed ? 60 : 236 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      aria-label="Sidebar"
    >
      {!collapsed && <p className="label-xs mb-2 px-5">Console</p>}
      <SidebarNav collapsed={collapsed} />
      <div className="mt-auto space-y-1 px-2">
        <button
          type="button"
          onClick={() => dispatch(uiActions.toggleDevConsole())}
          aria-pressed={consoleOpen}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors',
            consoleOpen ? 'bg-elevated text-fg' : 'text-fg-2 hover:bg-hover/60 hover:text-fg',
          )}
        >
          <TerminalSquare className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
          {!collapsed ? (
            <span>Developer console</span>
          ) : (
            <span className="sr-only">Developer console</span>
          )}
        </button>
        {!collapsed && (
          <div className="mx-1 mt-3 rounded-lg border border-line/70 bg-bg/40 p-3">
            <p className="label-xs flex items-center gap-1.5">
              <Database className="h-3 w-3" aria-hidden /> Local-first
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
              Reads come from IndexedDB. Writes queue durably and sync when the backend answers.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => dispatch(uiActions.toggleSidebar())}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] text-fg-3 hover:bg-hover/60 hover:text-fg"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
