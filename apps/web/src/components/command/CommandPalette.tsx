import { Command } from 'cmdk';
import {
  FlaskConical,
  ListTodo,
  Map,
  Network,
  Play,
  Plus,
  PlugZap,
  RefreshCcwDot,
  RefreshCw,
  Search,
  TerminalSquare,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useNavigate } from 'react-router';
import { useRuntime } from '../../app/RuntimeContext';
import { useAppDispatch, useAppSelector } from '../../store';
import { challengeActions } from '../../store/challengeSlice';
import { uiActions } from '../../store/uiSlice';
import { Kbd } from '../ui/States';

interface Item {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  run: () => void;
}

export function CommandPalette() {
  const open = useAppSelector((state) => state.ui.commandPaletteOpen);
  const disconnected = useAppSelector((state) => state.simulator.disconnected);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const runtime = useRuntime();
  const close = () => dispatch(uiActions.setCommandPalette(false));

  const groups: { heading: string; items: Item[] }[] = [
    {
      heading: 'Actions',
      items: [
        {
          id: 'create',
          label: 'Create incident',
          icon: Plus,
          keywords: ['new', 'add'],
          run: () => dispatch(uiActions.openEditor('new')),
        },
        {
          id: 'search',
          label: 'Search incidents',
          icon: Search,
          keywords: ['find', 'filter'],
          run: () => {
            navigate('/incidents');
            setTimeout(
              () =>
                document
                  .querySelector<HTMLInputElement>('[data-testid="incident-search"]')
                  ?.focus(),
              50,
            );
          },
        },
        {
          id: 'toggle-network',
          label: disconnected ? 'Restore simulated connectivity' : 'Disconnect network (simulated)',
          icon: disconnected ? PlugZap : Unplug,
          keywords: ['offline', 'online', 'toggle', 'connectivity'],
          run: () => void runtime.setSimulatedDisconnect(!disconnected),
        },
        {
          id: 'sync-now',
          label: 'Sync now',
          icon: RefreshCw,
          keywords: ['flush', 'queue'],
          run: () => void runtime.syncNow(),
        },
        {
          id: 'challenge',
          label: 'Start guided demo (60-second challenge)',
          icon: Play,
          keywords: ['tour', 'demo'],
          run: () => {
            dispatch(challengeActions.start());
            navigate('/');
          },
        },
      ],
    },
    {
      heading: 'Navigate',
      items: [
        {
          id: 'lab',
          label: 'Open Chaos Lab',
          icon: FlaskConical,
          keywords: ['playground', 'simulator'],
          run: () => navigate('/lab'),
        },
        {
          id: 'sync',
          label: 'Open Sync Center',
          icon: RefreshCcwDot,
          keywords: ['queue', 'visualizer'],
          run: () => navigate('/sync'),
        },
        {
          id: 'architecture',
          label: 'Open architecture viewer',
          icon: Network,
          run: () => navigate('/architecture'),
        },
        {
          id: 'incidents',
          label: 'Go to incidents',
          icon: ListTodo,
          run: () => navigate('/incidents'),
        },
        { id: 'map', label: 'Go to operations map', icon: Map, run: () => navigate('/map') },
        {
          id: 'queue',
          label: 'Open pending queue',
          icon: RefreshCcwDot,
          run: () => dispatch(uiActions.setQueueDrawer(true)),
        },
        {
          id: 'console',
          label: 'Toggle developer console',
          icon: TerminalSquare,
          run: () => dispatch(uiActions.toggleDevConsole()),
        },
      ],
    },
  ];

  return (
    <D.Root open={open} onOpenChange={(value) => dispatch(uiActions.setCommandPalette(value))}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[75] bg-[#02040a]/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <D.Content
          className="panel panel-lit fixed top-[14vh] left-1/2 z-[75] w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden bg-surface data-[state=open]:animate-scale-in"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Command palette</D.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-2 border-b border-line/70 px-4">
              <Search className="h-4 w-4 text-fg-3" aria-hidden />
              <Command.Input
                autoFocus
                placeholder="Type a command…"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-fg-3">
                No matching command.
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group key={group.heading} heading={group.heading}>
                  {group.items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.label}
                      keywords={item.keywords}
                      onSelect={() => {
                        close();
                        item.run();
                      }}
                      className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-fg-2"
                    >
                      <item.icon className="h-4 w-4 text-fg-3" aria-hidden />
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
