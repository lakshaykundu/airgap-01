import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithRuntime } from '../../test/renderWithRuntime';
import { uiActions } from '../../store/uiSlice';
import { IncidentEditor } from './IncidentEditor';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe('IncidentEditor', () => {
  it('blocks invalid input with accessible errors, then stores a valid incident locally with a queued mutation', async () => {
    const user = userEvent.setup();
    const { store, db, runtime } = renderWithRuntime(<IncidentEditor />);
    cleanup = () => runtime.dispose();
    act(() => {
      store.dispatch(uiActions.openEditor('new'));
    });

    await user.click(await screen.findByTestId('incident-submit'));
    const title = screen.getByLabelText('Incident title');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Title must be at least 3 characters',
    );
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(await db.incidents.count()).toBe(0);

    await user.type(title, 'Telemetry gap detected');
    await user.click(screen.getByRole('radio', { name: 'critical' }));
    await user.selectOptions(screen.getByLabelText('Sector'), 's05');
    await user.click(screen.getByTestId('incident-submit'));

    await waitFor(async () => expect(await db.incidents.count()).toBe(1));
    const [incident] = await db.incidents.toArray();
    expect(incident).toMatchObject({
      title: 'Telemetry gap detected',
      severity: 'critical',
      sectorId: 's05',
      version: 0,
      syncStatus: 'pending',
    });
    expect((await db.mutationQueue.toArray()).map((m) => m.type)).toEqual(['CREATE_INCIDENT']);
    await waitFor(() => expect(store.getState().ui.editor).toBeNull());
  });
});
