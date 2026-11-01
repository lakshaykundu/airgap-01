import { useState } from 'react';
import { useConnection } from '../../hooks/useConnection';
import { usePendingCount } from '../../hooks/useLiveData';
import { connectionLabel } from './connectionLabel';

/**
 * Screen-reader announcements for meaningful async changes only: connection
 * state transitions and the queue draining. High-frequency metrics are never
 * announced.
 */
export function LiveAnnouncer() {
  const connection = useConnection();
  const pending = usePendingCount();
  const [message, setMessage] = useState('');
  const [previousState, setPreviousState] = useState(connection.state);
  const [previousPending, setPreviousPending] = useState(pending);

  // "Adjust state when a value changes" during render (no effect round-trip).
  if (previousState !== connection.state) {
    setPreviousState(connection.state);
    if (connection.state !== 'SYNCHRONIZING' && connection.state !== 'CHECKING') {
      setMessage(
        `Connection status: ${connectionLabel(connection.state, connection.offlineReason)}`,
      );
    }
  }
  if (previousPending !== pending) {
    setPreviousPending(pending);
    if (previousPending > 0 && pending === 0) setMessage('All changes synchronized.');
  }

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
