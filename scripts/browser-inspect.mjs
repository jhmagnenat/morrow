import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Use the dedicated local Chrome started with --remote-debugging-port=9222.
// Usage: node scripts/browser-inspect.mjs http://localhost:3000/study
const url = new URL(process.argv[2] || 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('This helper only inspects local project pages.');
}
const response = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
if (!response.ok) throw new Error(`Chrome connection failed: ${response.status}`);
const target = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out: ${method}`));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  await command('Page.enable');
  await command('Runtime.enable');
  if(process.argv.includes('--fresh-storage')){
    const fixture=await(await fetch(new URL('/api/export',url))).json();
    assert.equal(fixture.documents?.[0]?.title,'Disposable offline integration fixture','Storage reset is restricted to the disposable fixture');
    await command('Storage.clearDataForOrigin',{origin:url.origin,storageTypes:'all'});
  }
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await command('Page.navigate', { url: url.href });
  await command('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      const ready = async () => {
        await document.fonts.ready;
        setTimeout(resolve, 2000);
      };
      if (document.readyState === 'complete') ready();
      else window.addEventListener('load', ready, { once: true });
    })`,
    awaitPromise: true,
  });
  if (process.argv.includes('--check-study')) {
    const { checkStudySession } = await import('./check-study-session.mjs');
    await checkStudySession(command);
  }
  if(process.argv.includes('--check-offline')){const {checkOfflineStudy}=await import('./check-offline-study.mjs');await checkOfflineStudy(command);}
  if(process.argv.includes('--check-tools')){const {checkWorkspaceTools}=await import('./check-workspace-tools.mjs');await checkWorkspaceTools(command);}
  if(process.argv.includes('--check-qa-generator')){const {checkQaGenerator}=await import('./check-qa-generator.mjs');await checkQaGenerator(command);}
  if(process.argv.includes('--check-backup-dialog')){const {checkBackupDialog}=await import('./check-backup-dialog.mjs');await checkBackupDialog(command);}
  if (process.argv.includes('--check-compact')) {
    const { checkCompactMapping } = await import('./check-compact-mapping.mjs');
    await checkCompactMapping(command);
  }
  if(process.argv.includes('--check-keyboard')){const {checkMappingKeyboard}=await import('./check-mapping-keyboard.mjs');await checkMappingKeyboard(command);}
  if(process.argv.includes('--check-quality')){const {checkQualityUI}=await import('./check-quality-ui.mjs');await checkQualityUI(command);}
  if(process.argv.includes('--check-intuition')){const {checkIntuitiveNotes}=await import('./check-intuitive-notes.mjs');await checkIntuitiveNotes(command);}
  if(process.argv.includes('--check-clair')){const {checkClairWorkflows}=await import('./check-clair-workflows.mjs');await checkClairWorkflows(command);}
  if (process.argv.includes('--check-mapping')) {
    const evaluate = async (expression) => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 250))');
    const viewport = () => evaluate(`(() => {
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);
      return { x: matrix.e, y: matrix.f, zoom: matrix.a };
    })()`);
    const drag = async (x, y) => {
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      for (let step = 1; step <= 5; step++) {
        await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + step * 12, y: y + step * 8, button: 'left', buttons: 1 });
      }
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 60, y: y + 40, button: 'left', buttons: 0, clickCount: 1 });
      await settle();
    };
    let before = await viewport();
    await drag(300, 350);
    let after = await viewport();
    assert.ok(Math.abs(after.x - before.x) > 40, 'Dragging the background must pan');
    assert.equal(after.zoom, before.zoom);
    before = after;
    await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 400, deltaX: 80, deltaY: 120 });
    await settle();
    after = await viewport();
    assert.ok(after.zoom < before.zoom, 'Ordinary wheel must zoom out');
    before = after;
    await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 400, y: 400, deltaX: 0, deltaY: -120, modifiers: 2 });
    await settle();
    after = await viewport();
    assert.ok(after.zoom > before.zoom, 'Ctrl + wheel must zoom');
    const node = await evaluate(`(() => {
      const pane = document.querySelector('.react-flow').getBoundingClientRect();
      for (const node of document.querySelectorAll('.react-flow__node')) {
        const rect = node.getBoundingClientRect();
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
        if (x > pane.left + 30 && x < pane.right - 100 && y > pane.top + 90 && y < pane.bottom - 170) {
          return { id: node.dataset.id, x, y, transform: node.style.transform };
        }
      }
    })()`);
    assert.ok(node, 'A visible notion is needed to test dragging on a notion');
    before = await viewport();
    await drag(node.x, node.y);
    after = await viewport();
    assert.ok(Math.abs(after.x - before.x) > 40, 'Dragging on a notion must also pan');
    assert.equal(after.zoom, before.zoom);
    assert.equal(await evaluate(`document.querySelector('[data-id="${node.id}"]').style.transform`), node.transform, 'Node layout must stay fixed');
    await evaluate(`document.querySelector('[data-id="${node.id}"]').click()`);
    await settle();
    assert.equal(await evaluate(`document.body.innerText.includes('Click a node or a link in the graph to see its details here.')`), false, 'Clicking a notion must still open its details');
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Backup').click()`);
    await settle();
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Clear mapping only…').click()`);
    await settle();
    assert.ok(await evaluate(`document.body.innerText.includes('Your Browse cards and their progress will be preserved.')`));
    console.log('PASS: background drag, notion drag, stable node layout, wheel zoom, Ctrl zoom, notion selection, backup confirmation. No user data cleared.');
  }
  if(process.argv.includes('--check-offline-chains')){
    const {checkOfflineChains}=await import('./check-offline-chains.mjs');
    await checkOfflineChains(command);
  }
  const page = await command('Runtime.evaluate', {
    expression: `JSON.stringify({
      title: document.title, url: location.href,
      text: document.body.innerText.slice(0, 4000),
      links: [...document.querySelectorAll('a')].map(a => ({ text: a.innerText, href: a.getAttribute('href') })),
      buttons: [...document.querySelectorAll('button')].slice(0,60).map(b => ({ text: b.innerText, label: b.getAttribute('aria-label') }))
    })`, returnByValue: true,
  });
  const name = url.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
  if (process.argv.includes('--check-clair')) assert.equal(errors.length, 0, 'C.L.A.I.R. workflows must produce no browser runtime exception');
  await mkdir('.next/browser-inspection', { recursive: true });
  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const path = `.next/browser-inspection/${name}.png`;
  await writeFile(path, Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ ...JSON.parse(page.result.value), errors, screenshot: path }, null, 2));
} finally {
  await command('Page.close').catch(() => {});
  socket.close();
}
