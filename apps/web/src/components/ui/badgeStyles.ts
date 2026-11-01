import type { IncidentSeverity } from '@airgap/shared';

export const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  critical: 'border-danger/50 bg-danger/12 text-danger',
  high: 'border-[#ff8a5c]/45 bg-[#ff8a5c]/10 text-[#ff9d76]',
  medium: 'border-warning/45 bg-warning/10 text-warning',
  low: 'border-line bg-elevated text-fg-2',
};
