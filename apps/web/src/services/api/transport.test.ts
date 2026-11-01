import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SIMULATOR, NetworkError, Transport, type SimulatorConfig } from './transport';

function setup(overrides: Partial<SimulatorConfig> = {}) {
  const config: SimulatorConfig = { ...DEFAULT_SIMULATOR, ...overrides };
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const sleep = vi.fn(async () => undefined);
  const onDropConsumed = vi.fn(() => {
    config.dropNextMutationResponse = false;
  });
  const transport = new Transport({
    getConfig: () => config,
    getSessionId: () => 'session-1',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep,
    onDropConsumed,
  });
  return { transport, fetchImpl, sleep, config, onDropConsumed };
}

describe('Transport (network simulator)', () => {
  it('rejects every request while the simulated disconnect is on, without touching the network', async () => {
    const { transport, fetchImpl } = setup({ disconnected: true });
    await expect(transport.request('GET', '/api/incidents')).rejects.toMatchObject({
      kind: 'simulated-disconnect',
    });
    await expect(
      transport.request('GET', '/api/health', { kind: 'health' }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('injects the configured latency before sending and records it', async () => {
    const { transport, sleep } = setup({ latencyMs: 400 });
    await transport.request('GET', '/api/incidents');
    expect(sleep).toHaveBeenCalledWith(400);
    expect(transport.requestLog[0]).toMatchObject({
      injectedLatencyMs: 400,
      ok: true,
      outcome: '200',
    });
  });

  it('produces a deterministic failure sequence for a given seed', async () => {
    const run = async () => {
      const { transport } = setup({ failureRate: 0.5, failureSeed: 1234 });
      const outcomes: string[] = [];
      for (let i = 0; i < 20; i++) {
        outcomes.push(
          await transport.request('GET', '/api/incidents').then(
            () => 'ok',
            (e: NetworkError) => e.kind,
          ),
        );
      }
      return outcomes;
    };
    const first = await run();
    expect(first).toEqual(await run());
    expect(first).toContain('simulated-failure');
    expect(first).toContain('ok');
  });

  it('never fails health probes randomly', async () => {
    const { transport } = setup({ failureRate: 0.5 });
    for (let i = 0; i < 20; i++)
      await expect(
        transport.request('GET', '/api/health', { kind: 'health' }),
      ).resolves.toBeDefined();
  });

  it('drops exactly one mutation response AFTER the request was sent', async () => {
    const { transport, fetchImpl, onDropConsumed } = setup({ dropNextMutationResponse: true });
    await expect(transport.request('GET', '/api/incidents')).resolves.toBeDefined(); // reads are not affected
    await expect(
      transport.request('POST', '/api/incidents', { body: {}, idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ kind: 'response-lost' });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // the mutation DID reach the server
    expect(onDropConsumed).toHaveBeenCalledTimes(1);
    await expect(
      transport.request('POST', '/api/incidents', { body: {}, idempotencyKey: 'k' }),
    ).resolves.toBeDefined();
  });

  it('sends session and idempotency headers', async () => {
    const { transport, fetchImpl } = setup();
    await transport.request('PATCH', '/api/incidents/x', {
      body: { a: 1 },
      idempotencyKey: 'key-1',
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({
      'x-airgap-session': 'session-1',
      'idempotency-key': 'key-1',
    });
  });
});
