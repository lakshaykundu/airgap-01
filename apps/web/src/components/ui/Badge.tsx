import type { IncidentSeverity, IncidentStatus, SyncStatus } from '@airgap/shared';
import {
  CircleCheck,
  CircleDashed,
  CloudOff,
  LoaderCircle,
  OctagonAlert,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { SEVERITY_STYLES } from './badgeStyles';

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md border px-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <Badge className={SEVERITY_STYLES[severity]}>
      {severity === 'critical' && (
        <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse-soft" aria-hidden />
      )}
      {severity}
    </Badge>
  );
}

const STATUS_STYLES: Record<IncidentStatus, string> = {
  open: 'border-[#5aa9ff]/40 bg-[#5aa9ff]/10 text-[#8cc4ff]',
  investigating: 'border-accent/45 bg-accent/10 text-[#b7a6ff]',
  resolved: 'border-success/40 bg-success/10 text-success',
};

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge className={STATUS_STYLES[status]}>{status}</Badge>;
}

const SYNC_META: Record<SyncStatus, { label: string; className: string; icon: ReactNode }> = {
  synced: {
    label: 'Synced',
    className: 'border-success/30 text-success bg-success/5',
    icon: <CircleCheck className="h-3 w-3" />,
  },
  pending: {
    label: 'Pending',
    className: 'border-accent/50 text-[#b7a6ff] bg-accent/10',
    icon: <CircleDashed className="h-3 w-3" />,
  },
  syncing: {
    label: 'Syncing',
    className: 'border-primary/50 text-primary bg-primary/10',
    icon: <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" />,
  },
  conflict: {
    label: 'Conflict',
    className: 'border-warning/60 text-warning bg-warning/10',
    icon: <TriangleAlert className="h-3 w-3" />,
  },
  failed: {
    label: 'Failed',
    className: 'border-danger/60 text-danger bg-danger/10',
    icon: <OctagonAlert className="h-3 w-3" />,
  },
};

export function SyncBadge({ status, className }: { status: SyncStatus; className?: string }) {
  const meta = SYNC_META[status];
  return (
    <Badge className={cn(meta.className, className)}>
      {meta.icon}
      <span>{meta.label}</span>
    </Badge>
  );
}

export function OfflineBadge() {
  return (
    <Badge className="border-warning/50 bg-warning/10 text-warning">
      <CloudOff className="h-3 w-3" /> Local only
    </Badge>
  );
}
