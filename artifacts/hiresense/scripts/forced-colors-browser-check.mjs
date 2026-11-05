import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const chromiumPath = process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium';
const serverOutput = [];
const browserErrors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(check, message, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(message);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
      resolve();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function inspectSystemColors(page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;top:-100px';
    document.body.append(probe);
    const color = (value) => {
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };
    const background = (value) => {
      probe.style.backgroundColor = value;
      return getComputedStyle(probe).backgroundColor;
    };
    const colors = {
      canvas: background('Canvas'),
      canvasText: color('CanvasText'),
      highlight: color('Highlight'),
      field: background('Field'),
      fieldText: color('FieldText'),
      buttonText: color('ButtonText'),
    };
    probe.remove();
    return colors;
  });
}

async function assertFocusCue(page, selector, expectedColor, label) {
  await page.keyboard.press('Tab');
  const focus = await page.locator(selector).evaluate((element) => {
    element.focus();
    const style = getComputedStyle(element);
    return {
      matches: element.matches(':focus-visible'),
      width: style.outlineWidth,
      style: style.outlineStyle,
      color: style.outlineColor,
    };
  });
  assert(focus.matches && focus.width === '2px' && focus.style !== 'none' && focus.color === expectedColor,
    `${label}: keyboard focus cue is missing or is not rendered in Highlight`);
}

async function checkViewport(browser, viewport, baseUrl) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    forcedColors: 'active',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      browserErrors.push(message.text());
    }
  });

  try {
    await page.goto(new URL('/inputs', baseUrl).href, { waitUntil: 'networkidle' });
    await page.getByTestId('input-currentCash').waitFor();
    const colors = await inspectSystemColors(page);
    assert(await page.evaluate(() => matchMedia('(forced-colors: active)').matches),
      `${viewport.name}: browser did not activate forced colors`);

    const inputView = await page.evaluate(() => {
      const warning = document.querySelector('[data-testid="synthetic-data-warning"]');
      const boundary = document.querySelector('.contrast-input-boundary');
      const select = document.querySelector('.contrast-select');
      const input = document.querySelector('[data-testid="input-currentCash"]');
      const styleOf = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          visible: rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none',
          borderWidth: style.borderTopWidth,
          borderColor: style.borderTopColor,
          background: style.backgroundColor,
          color: style.color,
        };
      };
      return { warning: styleOf(warning), boundary: styleOf(boundary), select: styleOf(select), input: styleOf(input) };
    });
    assert(inputView.warning.visible && inputView.warning.borderColor === colors.canvasText &&
      inputView.warning.background === colors.canvas && inputView.warning.color === colors.canvasText,
    `${viewport.name}: synthetic-data warning is missing its visible Canvas/CanvasText treatment`);
    assert(inputView.boundary.visible && inputView.boundary.borderWidth === '1px' &&
      inputView.boundary.borderColor === colors.buttonText && inputView.boundary.background === colors.field,
    `${viewport.name}: input boundary is missing its visible ButtonText/Field treatment`);
    assert(inputView.select.visible && inputView.select.borderWidth === '1px' &&
      inputView.select.borderColor === colors.buttonText && inputView.select.background === colors.field,
    `${viewport.name}: select boundary is missing its visible ButtonText/Field treatment`);
    assert(inputView.input.visible, `${viewport.name}: current-cash input is not visible`);
    await assertFocusCue(page, '[data-testid="input-currentCash"]', colors.highlight, `${viewport.name} input`);

    await page.getByTestId('load-northstar').click();
    await page.getByTestId('input-monthlyOperatingCashFlow').fill('-1000000');
    await page.getByTestId('button-go-scenarios').click();
    await page.getByTestId('hiring-comparison-summary').waitFor();
    const scenarioView = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const warning = document.querySelector('[data-testid="synthetic-data-warning"]');
      const warningStyle = getComputedStyle(warning);
      const comparison = document.querySelector('[data-testid="hiring-comparison-summary"] [role="region"]');
      const comparisonTable = comparison.querySelector('table');
      const comparisonHead = comparisonTable.querySelector('thead');
      const comparisonHeadStyle = getComputedStyle(comparisonHead);
      const headers = [...comparisonHead.querySelectorAll('th')].map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          text: element.innerText.trim(),
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
          color: style.color,
          background: style.backgroundColor,
        };
      });
      const negative = document.querySelector('[data-testid="ending-cash-hire-now"]');
      const negativeStyle = getComputedStyle(negative);
      const comparisonBoundary = getComputedStyle(document.querySelector('[data-testid="hiring-comparison-summary"]'));
      return {
        warning: {
          visible: visible(warning),
          border: warningStyle.borderTopColor,
          background: warningStyle.backgroundColor,
          color: warningStyle.color,
        },
        comparisonVisible: visible(comparison),
        comparisonOverflow: comparison.scrollWidth > comparison.clientWidth,
        comparisonBoundary: {
          width: comparisonBoundary.borderTopWidth,
          style: comparisonBoundary.borderTopStyle,
          color: comparisonBoundary.borderTopColor,
        },
        headers,
        headerBoundary: {
          width: comparisonHeadStyle.borderBottomWidth,
          color: comparisonHeadStyle.borderBottomColor,
        },
        negative: {
          visible: visible(negative),
          marked: negative.classList.contains('cash-negative'),
          color: negativeStyle.color,
          decoration: negativeStyle.textDecorationLine,
          thickness: negativeStyle.textDecorationThickness,
          weight: negativeStyle.fontWeight,
        },
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    assert(scenarioView.warning.visible && scenarioView.warning.border === colors.canvasText &&
      scenarioView.warning.background === colors.canvas && scenarioView.warning.color === colors.canvasText,
    `${viewport.name}: scenario warning is missing its visible Canvas/CanvasText treatment`);
    assert(scenarioView.comparisonVisible, `${viewport.name}: comparison scroll region is not visible`);
    assert(scenarioView.comparisonBoundary.width === '1px' && scenarioView.comparisonBoundary.style !== 'none' &&
      scenarioView.comparisonBoundary.color !== 'rgba(0, 0, 0, 0)',
    `${viewport.name}: comparison table boundary is not visible`);
    assert(scenarioView.headers.length === 6 && scenarioView.headers.every((header) =>
      header.width > 0 && header.height > 0 && header.display !== 'none' && header.visibility !== 'hidden' &&
      header.color === colors.canvasText && header.background === colors.canvas),
    `${viewport.name}: comparison column headings are clipped or missing system colors`);
    assert(scenarioView.headerBoundary.width === '2px' && scenarioView.headerBoundary.color === colors.canvasText,
      `${viewport.name}: comparison header boundary is not visible in CanvasText`);
    assert(scenarioView.negative.visible && scenarioView.negative.marked &&
      scenarioView.negative.color === colors.canvasText && scenarioView.negative.decoration.includes('underline') &&
      scenarioView.negative.thickness === '2px' && Number(scenarioView.negative.weight) >= 700,
    `${viewport.name}: negative cash lost its visible non-color high-contrast styling`);
    assert(scenarioView.documentWidth <= scenarioView.viewportWidth,
      `${viewport.name}: comparison table widened the page`);

    const comparisonSelector = '[data-testid="hiring-comparison-summary"] [role="region"]';
    await assertFocusCue(page, comparisonSelector, colors.highlight, `${viewport.name} comparison table`);
    const comparisonRegion = page.locator(comparisonSelector);
    const initialComparisonScroll = await comparisonRegion.evaluate((element) => element.scrollLeft);
    if (scenarioView.comparisonOverflow) {
      for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
      const comparisonScroll = await comparisonRegion.evaluate((element) => element.scrollLeft);
      assert(comparisonScroll > initialComparisonScroll,
        `${viewport.name}: ArrowRight did not scroll the comparison table`);
      const lastComparisonHeader = page.locator(`${comparisonSelector} thead th:last-child`);
      const comparisonHeaderVisible = await lastComparisonHeader.evaluate((element) => {
        const cell = element.getBoundingClientRect();
        const region = element.closest('[role="region"]').getBoundingClientRect();
        return cell.right > region.left && cell.left < region.right;
      });
      assert(comparisonHeaderVisible, `${viewport.name}: last comparison heading cannot be brought into view`);
    }

    await page.getByTestId('monthly-details-no-hire').locator('summary').click();
    const monthlyRegion = page.getByTestId('projection-scroll-no-hire');
    await monthlyRegion.waitFor();
    const monthlyView = await monthlyRegion.evaluate((region) => {
      const table = region.querySelector('table');
      const head = table.querySelector('thead');
      const headStyle = getComputedStyle(head);
      const headers = [...head.querySelectorAll('th')].map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          text: element.innerText.trim(),
          width: rect.width,
          height: rect.height,
          display: style.display,
          visibility: style.visibility,
          color: style.color,
          background: style.backgroundColor,
        };
      });
      const negative = region.querySelector('.cash-negative');
      const negativeStyle = getComputedStyle(negative);
      return {
        visible: region.getBoundingClientRect().width > 0 && region.getBoundingClientRect().height > 0,
        overflow: region.scrollWidth > region.clientWidth,
        headers,
        headerBorder: headStyle.borderBottomColor,
        headerBorderWidth: headStyle.borderBottomWidth,
        negativeVisible: negative.getBoundingClientRect().width > 0 && negative.getBoundingClientRect().height > 0,
        negativeColor: negativeStyle.color,
        negativeDecoration: negativeStyle.textDecorationLine,
        negativeThickness: negativeStyle.textDecorationThickness,
      };
    });
    assert(monthlyView.visible, `${viewport.name}: monthly table is not visible`);
    assert(monthlyView.headers.length >= 3 && monthlyView.headers.every((header) =>
      header.width > 0 && header.height > 0 && header.display !== 'none' && header.visibility !== 'hidden' &&
      header.color === colors.canvasText && header.background === colors.canvas),
    `${viewport.name}: monthly table headings are clipped or missing system colors`);
    assert(monthlyView.headerBorderWidth === '2px' && monthlyView.headerBorder === colors.canvasText,
      `${viewport.name}: monthly table header boundary is not visible in CanvasText`);
    assert(monthlyView.negativeVisible && monthlyView.negativeColor === colors.canvasText &&
      monthlyView.negativeDecoration.includes('underline') && monthlyView.negativeThickness === '2px',
    `${viewport.name}: negative monthly cash lost its visible high-contrast treatment`);

    await assertFocusCue(page, '[data-testid="projection-scroll-no-hire"]', colors.highlight, `${viewport.name} monthly table`);
    const initialMonthlyScroll = await monthlyRegion.evaluate((element) => element.scrollLeft);
    if (monthlyView.overflow) {
      for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight');
      const monthlyScroll = await monthlyRegion.evaluate((element) => element.scrollLeft);
      assert(monthlyScroll > initialMonthlyScroll, `${viewport.name}: ArrowRight did not scroll the monthly table`);
      const lastMonthlyHeader = monthlyRegion.locator('thead th:last-child');
      const monthlyHeaderVisible = await lastMonthlyHeader.evaluate((element) => {
        const cell = element.getBoundingClientRect();
        const region = element.closest('[role="region"]').getBoundingClientRect();
        return cell.right > region.left && cell.left < region.right;
      });
      assert(monthlyHeaderVisible, `${viewport.name}: last monthly heading cannot be brought into view`);
    }
    assert(browserErrors.length === 0,
      `${viewport.name}: browser errors:\n${browserErrors.join('\n')}`);

    console.log(`PASS ${viewport.name}: rendered system colors, boundaries, warnings, negative cash, focus and headings${scenarioView.comparisonOverflow || monthlyView.overflow ? ', plus arrow-key table scrolling' : ''}`);
  } finally {
    await context.close();
  }
}

async function main() {
  let server;
  let browser;
  try {
    await access(chromiumPath);
    const port = await findPort();
    const baseUrl = `http://127.0.0.1:${port}/`;
    server = spawn('pnpm', ['run', 'dev'], {
      env: { ...process.env, PORT: String(port), BASE_PATH: '/' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [server.stdout, server.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => serverOutput.push(chunk.trim()));
    }
    await waitFor(async () => {
      if (server.exitCode !== null) {
        throw new Error(`HireSense dev server exited early:\n${serverOutput.slice(-12).join('\n')}`);
      }
      try {
        return (await fetch(baseUrl)).ok;
      } catch {
        return false;
      }
    }, `HireSense dev server did not start:\n${serverOutput.slice(-12).join('\n')}`);

    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    for (const viewport of [
      { name: 'narrow 320px', width: 320, height: 900 },
      { name: 'wide 1440px', width: 1440, height: 1000 },
    ]) {
      await checkViewport(browser, viewport, baseUrl);
    }
    console.log('Forced-colors browser check passed.');
  } finally {
    await browser?.close();
    await stopProcess(server);
  }
}

main().catch((error) => {
  console.error(`Forced-colors browser check failed: ${error.message}`);
  process.exitCode = 1;
});
