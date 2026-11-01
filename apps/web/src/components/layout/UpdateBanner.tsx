import { RefreshCw } from 'lucide-react';
import { applyServiceWorkerUpdate } from '../../app/serviceWorker';
import { useAppSelector } from '../../store';
import { Button } from '../ui/Button';

/** A new build was precached in the background; the user decides when to switch. */
export function UpdateBanner() {
  const sw = useAppSelector((state) => state.connectivity.serviceWorker);
  if (sw !== 'update-available') return null;
  return (
    <div
      role="status"
      className="relative z-30 flex items-center justify-center gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs text-[#d4caff]"
    >
      <span>A new version of AIRGAP/01 is cached and ready.</span>
      <Button size="xs" variant="accent" mono onClick={applyServiceWorkerUpdate}>
        <RefreshCw className="h-3 w-3" /> Reload
      </Button>
    </div>
  );
}
