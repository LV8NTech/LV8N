// Navigation-only check: block every hiring API/provider request before loading.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright-core';

const base = process.env.HIRESENSE_TEST_URL || 'http://127.0.0.1:80';
const ledger = new URL('../../../generated-artifacts/meta-demo-budget.json', import.meta.url);
const before = await readFile(ledger);
const browser = await chromium.launch({
  executablePath: '/repl/tools/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [];
try {
  for (const [name, options] of [
    ['desktop-chromium', { viewport: { width: 1440, height: 900 } }],
    ['ipad-safari-ua-touch-emulation-chromium', { ...devices['iPad (gen 7)'] }],
  ]) {
    const context = await browser.newContext(options);
    const blocked = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/api/hiring/') || url.hostname === 'api.meta.ai') {
        blocked.push(url.pathname);
        await route.abort();
      } else await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    async function navigate(label) {
      const menu = page.getByTestId('button-menu');
      if (await menu.isVisible()) await menu.click();
      const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: label, exact: true });
      if (options.isMobile) await link.tap();
      else await link.click();
    }
    async function atStart() {
      await page.waitForFunction(() => window.scrollY <= 1);
      const position = await page.locator('#page-title').evaluate(el => ({
        top: el.getBoundingClientRect().top,
        bottom: el.getBoundingClientRect().bottom,
        viewport: innerHeight,
      }));
      assert(position.top >= 0 && position.bottom < position.viewport, `${name}: title not visible`);
      assert(await page.getByRole('main').evaluate(el => el === document.activeElement), `${name}: main not focused`);
      return position;
    }
    await page.goto(base + '/inputs', { waitUntil: 'networkidle' });
    await page.getByTestId('load-northstar').click();
    await navigate('Ask HireSense');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => scrollY > 200);
    await navigate('Scenarios');
    const fromAsk = await atStart();

    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => scrollY >= 400), `${name}: ordinary scrolling was reset`);
    await navigate('Scenarios');
    const samePage = await atStart();

    // Exercise a real existing section's native fragment navigation.
    await page.evaluate(() => {
      const target = [...document.querySelectorAll('main h2[id]')]
        .find(el => el.getBoundingClientRect().top > innerHeight + 100);
      if (!target) throw new Error('No below-fold scenario heading');
      location.hash = target.id;
    });
    await page.waitForFunction(() => scrollY > 100);
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => scrollY > 100), `${name}: native fragment jump was reset`);
    await navigate('Scenarios');
    await atStart();
    assert.deepEqual(blocked, [], `${name}: unexpected API traffic was blocked`);
    results.push({ name, fromAsk, samePage, ordinaryScroll: 'pass', fragmentNavigation: 'pass', hiringApiRequests: 0 });
    await context.close();
  }
  assert((await readFile(ledger)).equals(before), 'Paid ledger changed');
  console.log(JSON.stringify({ results, paidLedgerUnchanged: true, physicalIPad: false, webkitEngineTested: false }, null, 2));
} finally {
  await browser.close();
}
