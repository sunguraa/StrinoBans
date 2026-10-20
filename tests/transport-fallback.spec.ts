import { expect, test } from '@playwright/test';
import { startTransportFixture } from './helpers/local-transport-fixture';

interface HarnessState {
  status: { phase: string; peerCount: number };
  meta: { preset?: string };
  actions: { id: string }[];
  sameDoc: boolean;
  sameAwareness: boolean;
}
declare global {
  interface Window {
    transportTest: {
      start(room: string, creator: boolean): void;
      state(): HarnessState;
      act(id: string): void;
      disconnect(): void;
    };
  }
}

test('real Nostr fallback joins late and automatically reconnects without replacing Y.Doc or duplicating actions', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const fixture = await startTransportFixture();
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  const room = `fallback-${crypto.randomUUID()}`;
  try {
    // Every browser socket must remain local, including signaling and ICE. The
    // provider configs contain no STUN/TURN servers; fail any accidental HTTP probe.
    for (const context of [aContext, bContext]) {
      await context.route('**/*', (route) => {
        const host = new URL(route.request().url()).hostname;
        return host === '127.0.0.1' ? route.continue() : route.abort();
      });
    }
    await a.goto(fixture.origin);
    await a.evaluate((name) => window.transportTest.start(name, true), room);
    // Deliberately wait for the production discovery deadline using observable
    // status, not a fixed sleep. The second isolated browser joins after this.
    await expect
      .poll(() => a.evaluate(() => window.transportTest.state().status.phase), {
        timeout: 30_000,
      })
      .toBe('error');
    await expect
      .poll(() =>
        a.evaluate(() => window.transportTest.state().status.peerCount)
      )
      .toBe(0);
    await a.evaluate(() => window.transportTest.act('before-late-join'));
    await b.goto(fixture.origin);
    await b.evaluate((name) => window.transportTest.start(name, false), room);
    await expect
      .poll(() => b.evaluate(() => window.transportTest.state().meta.preset), {
        timeout: 40_000,
      })
      .toBe('frozen-local-config');
    for (const page of [a, b]) {
      await expect
        .poll(
          () => page.evaluate(() => window.transportTest.state().status.phase),
          { timeout: 40_000 }
        )
        .toBe('connected');
    }
    await expect
      .poll(() => b.evaluate(() => window.transportTest.state().actions))
      .toEqual([{ id: 'before-late-join' }]);
    await b.evaluate(() => window.transportTest.act('fallback-action'));
    await expect
      .poll(() => a.evaluate(() => window.transportTest.state().actions))
      .toEqual([{ id: 'before-late-join' }, { id: 'fallback-action' }]);

    // Stop relay publication and close real peer connections. Merely toggling
    // browser offline does not reliably disconnect localhost WebRTC data channels.
    fixture.pauseRelay(true);
    await Promise.all(
      [a, b].map((page) =>
        page.evaluate(() => window.transportTest.disconnect())
      )
    );
    for (const page of [a, b]) {
      await expect
        .poll(
          () =>
            page.evaluate(() => window.transportTest.state().status.peerCount),
          { timeout: 15_000 }
        )
        .toBe(0);
    }
    await a.evaluate(() => window.transportTest.act('offline-action'));
    fixture.pauseRelay(false);
    const expected = [
      { id: 'before-late-join' },
      { id: 'fallback-action' },
      { id: 'offline-action' },
    ];
    for (const page of [a, b]) {
      await expect
        .poll(
          () => page.evaluate(() => window.transportTest.state().status.phase),
          { timeout: 40_000 }
        )
        .toBe('connected');
      await expect
        .poll(() => page.evaluate(() => window.transportTest.state().actions), {
          timeout: 15_000,
        })
        .toEqual(expected);
      const state = await page.evaluate(() => window.transportTest.state());
      expect(state.sameDoc).toBe(true);
      expect(state.sameAwareness).toBe(true);
      expect(state.status.peerCount).toBe(1);
      expect(new Set(state.actions.map(({ id }) => id)).size).toBe(3);
    }
  } finally {
    await Promise.all([aContext.close(), bContext.close()]);
    await fixture.close();
  }
});
