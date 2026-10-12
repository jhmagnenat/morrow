import assert from 'node:assert/strict';

export async function checkCompactMapping(command) {
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 800))');
  const bounds = () => evaluate(`(() => {
    const pane = document.querySelector('.react-flow').getBoundingClientRect();
    const nodes = [...document.querySelectorAll('.react-flow__node')];
    return { count: nodes.length, allFit: nodes.every(node => {
      const r = node.getBoundingClientRect();
      return r.left >= pane.left && r.top >= pane.top && r.right <= pane.right && r.bottom <= pane.bottom;
    }), zoom: new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a };
  })()`);
  await settle();
  assert.equal(await evaluate(`document.body.innerText.includes('Show prerequisites')`), false);
  let state = await bounds();
  assert.ok(state.count > 0 && state.count <= 16);
  assert.ok(state.allFit, 'Every overview topic fits without panning');
  assert.ok(state.zoom >= .6, 'Overview labels remain readable');
  await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')];
    nodes.sort((a,b) => Number(b.innerText.match(/([0-9]+) subtopics/)?.[1] ?? 0) - Number(a.innerText.match(/([0-9]+) subtopics/)?.[1] ?? 0));
    nodes[0].click();
  })()`);
  await settle();
  assert.ok(await evaluate(`document.querySelector('[aria-label="Mapping path"]').innerText.includes('subtopics')`));
  state = await bounds();
  assert.ok(state.count <= 16 && state.allFit, 'Branch fits entirely in the viewport');
  assert.ok(await evaluate(`[...document.querySelectorAll('.react-flow__node button')].every(button => button.scrollHeight <= button.clientHeight + 1)`), 'Topic text cannot overflow its card');
  const departmentBranch = await evaluate(`(() => {
    const node = [...document.querySelectorAll('.react-flow__node')].find(n => n.innerText.startsWith('Insurance Company Structure'));
    if (!node) return false;
    node.click(); return true;
  })()`);
  if (departmentBranch) {
    await settle();
    state = await bounds();
    assert.ok(state.count <= 16 && state.allFit, 'Departments fit together without panning');
    assert.ok(state.zoom >= .6, 'Department labels remain readable');
  }
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText === 'Overview').click()`);
  await settle();
  const before = (await bounds()).zoom;
  await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 450, y: 450, deltaX: 0, deltaY: -120 });
  await settle();
  assert.ok((await bounds()).zoom > before, 'Ordinary wheel zooms without Ctrl');
  console.log('PASS: compact overview, readable fit, branch navigation, return to overview, ordinary wheel zoom. No data changed.');
}
