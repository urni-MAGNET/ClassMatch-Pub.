import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fixture } from './timetable-fixture.mjs';
const { chromium } = await import(process.env.CLASSMATCH_PLAYWRIGHT_MODULE || 'playwright');
await fs.mkdir(path.resolve('artifacts.local'), { recursive: true });
const artifacts = await fs.mkdtemp(path.join(path.resolve('artifacts.local'), 'magnet-timetable-'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CLASSMATCH_BROWSER_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost') return route.abort();
    if (url.pathname === '/src/js/school/mypage/login.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (url.pathname === '/src/js/supabase.js') return route.fulfill({ contentType: 'text/javascript', body: 'export const supabase = {};' });
    try {
      const file = path.resolve('.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };
      await route.fulfill({ body: await fs.readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  await page.goto('http://localhost:4179/mypage/create/');
  const info = await page.evaluate(async fixture => {
    const { buildTimetableAxisPages, buildTimetablePages, timetableSportSheets } = await import('/src/js/classmatch/timetable-table.js');
    const { renderAxisPage } = await import('/src/js/school/mypage/timetable-render.js');
    const { timetableWorkbookXML } = await import('/src/js/classmatch/timetable-excel.js');
    fixture.sports[1].courts.push({ venue: '体育館', court: 'B' }, { venue: '体育館', court: 'C' });
    fixture.rows[1].venue = '体育館'; fixture.rows[1].court = 'A';
    const pages = buildTimetableAxisPages(fixture.rows, fixture.settings, fixture.sports);
    const preview = document.querySelector('#timetable-preview'); preview.replaceChildren();
    const screen = document.createElement('div'); screen.className = 'timetable-screen-pages';
    const print = document.createElement('div'); print.className = 'timetable-print-pages';
    const meta = { title: '2026年度 秋季クラスマッチ', school: '県立サンプル高等学校', label: '第1案' };
    pages.forEach((page, i) => { renderAxisPage(screen, page, meta).hidden = i !== 0; });
    const sheets = timetableSportSheets(pages);
    sheets.forEach((sheet, i) => renderAxisPage(print, sheet, { ...meta, print: true, pageNumber: `${i + 1} / ${sheets.length}` }));
    preview.append(screen, print);
    const xml = timetableWorkbookXML(pages, buildTimetablePages(fixture.rows, fixture.settings, fixture.sports), meta);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error(doc.querySelector('parsererror').textContent);
    // Validate sparse XML cells and merged regions never overlap.
    const ns = 'urn:schemas-microsoft-com:office:spreadsheet';
    for (const table of doc.getElementsByTagName('Table')) {
      const occupied = new Set(); let r = 0;
      for (const row of table.getElementsByTagName('Row')) {
        let c = 0;
        for (const cell of row.getElementsByTagName('Cell')) {
          c = Number(cell.getAttributeNS(ns, 'Index')) - 1;
          const down = Number(cell.getAttributeNS(ns, 'MergeDown') || 0), across = Number(cell.getAttributeNS(ns, 'MergeAcross') || 0);
          for (let y = r; y <= r + down; y++) for (let x = c; x <= c + across; x++) {
            const key = `${y}:${x}`;
            if (occupied.has(key)) throw Error(`Overlapping spreadsheet cell ${key}`);
            occupied.add(key);
          }
        }
        r++;
      }
    }
    return { sheets: sheets.length, xml };
  }, fixture);
  await fs.writeFile(path.join(artifacts, 'timetable.xml'), info.xml);
  const screen = page.locator('.timetable-screen-pages');
  const a = await screen.locator('[data-match-id="m1"]').boundingBox();
  const b = await screen.locator('[data-match-id="m2"]').boundingBox();
  const c = await screen.locator('[data-match-id="m3"]').boundingBox();
  const lane = await screen.locator(".timetable-axis-lane").first().boundingBox(); assert.ok(Math.abs(a.width - lane.width) < 1); assert.equal(a.x, lane.x);
  assert.equal(a.y, b.y); assert.equal(a.height, 60); assert.equal(b.height, 45); assert.equal(a.y + a.height, c.y);
  assert.deepEqual(await screen.locator('[data-match-id="m1"] .timetable-axis-team').allTextContents(), ['25R', '27R']);
  const left = await screen.locator('[data-match-id="m1"] .timetable-axis-team').nth(0).boundingBox();
  const right = await screen.locator('[data-match-id="m1"] .timetable-axis-team').nth(1).boundingBox();
  assert.equal(left.y, right.y); assert.ok(right.x > left.x);
  await page.locator('#timetable-preview').screenshot({ path: path.join(artifacts, 'screen.png') });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.timetable-print-page').count(), info.sheets);
  const dimensions = await page.locator('.timetable-print-page').evaluateAll(sections => sections.map(section => ({ height: section.getBoundingClientRect().height, cards: [...section.querySelectorAll('.timetable-axis-card')].map(card => ({ height: card.clientHeight, text: card.innerText })) })));
  assert.ok(dimensions.every(sheet => sheet.height < 718), JSON.stringify(dimensions));
  const pdf = await page.pdf({ path: path.join(artifacts, 'timetable.pdf'), preferCSSPageSize: true, printBackground: true });
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, info.sheets);
  await page.locator('.timetable-print-page').first().screenshot({ path: path.join(artifacts, 'print.png') });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(`PASS: mixed durations, aligned geometry, separate teams, horizontal/vertical pagination, PDF, XML merges, mobile. Artifacts: ${artifacts}; sheets: ${info.sheets}`);
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  process.exit(process.exitCode || 0);
}
