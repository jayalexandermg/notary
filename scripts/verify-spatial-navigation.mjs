// Run with a Playwright Page against `pnpm dev`. No native OS claims are made.
// The fixture uses the production React component with simulated Tauri IPC.
export default async function verifySpatialNavigation(page) {
  const results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({ width: 350, height: 420 });
  await page.goto('http://127.0.0.1:1420/scripts/fixtures/spatial.html?surface=anchor');
  await page.getByRole('button', { name: 'Retrieve thoughts', exact: true }).hover();
  await page.locator('[data-row-id="coding"]').waitFor();
  const footprint = await page.locator('.ambient-panel').boundingBox();
  async function stableHover(id, expected, slotHint) {
    const target = page.locator(`${slotHint === undefined ? "" : `[data-slot="${slotHint}"] `}[data-row-id="${id}"]`);
    await target.scrollIntoViewIfNeeded();
    const slot = await target.evaluate(el => el.closest('[data-slot]').getAttribute('data-slot'));
    const source = page.locator(`[data-slot="${slot}"]`);
    const before = await source.locator('[data-row-id]').evaluateAll(rows => rows.map(el => ({ id: el.dataset.rowId, rect: el.getBoundingClientRect().toJSON() })));
    await target.hover();
    await page.locator(`[data-slot="${slot === "0" ? "1" : "0"}"] ${expected}`).waitFor();
    await page.waitForTimeout(250);
    const after = await source.locator('[data-row-id]').evaluateAll(rows => rows.map(el => ({ id: el.dataset.rowId, rect: el.getBoundingClientRect().toJSON() })));
    check(JSON.stringify(before) === JSON.stringify(after), `Hover relocated source rows at ${id}`);
    check(JSON.stringify(footprint) === JSON.stringify(await page.locator('.ambient-panel').boundingBox()), `Footprint grew at ${id}`);
    const centerHits = await target.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); });
    check(centerHits, `Hovered target ${id} is no longer clickable at its center`);
    results.push({ name: `hover target and siblings stay fixed: ${id}`, result: 'PASS', slot, maximumCoordinateDelta: 0 });
  }
  for (const [id,next] of [['coding','notary'],['notary','nav'],['nav','deep'],['deep','deeper'],['deeper','thought-b']]) {
    await stableHover(id, `[data-row-id="${next}"]`);
    await page.locator(`[data-row-id="${id}"]`).click();
    await page.locator(`[data-row-id="${next}"]`).waitFor();
  }
  check(await page.locator('[data-row-id="personal"]').count() === 0, 'Unrelated root hierarchy remained visible at depth');
  check(await page.locator('.spatial-slot').count() === 2, 'Navigation allocated extra depth panes');
  results.push({name:'five context depths use only two fixed slots',result:'PASS',footprint});
  await stableHover('thought-b', '[aria-label="Thought preview"]');
  await stableHover('thought-d', '[aria-label="Thought preview"]');
  check((await page.locator('.spatial-preview p').textContent()) === 'Capture D', 'Lateral capture preview is stale');
  await page.locator('[data-row-id="thought-d"]').click();
  check(await page.evaluate(()=>mock.calls.some(c=>c.command==='engage_capture' && c.args.id==='thought-d')), 'Click did not engage the hovered capture');
  results.push({name:'lateral capture B to D and click engagement',result:'PASS'});
  const sibling = page.locator('[data-row-id="sibling-10"]');
  await sibling.scrollIntoViewIfNeeded();
  await stableHover('sibling-10', '[aria-label="Thought preview"]');
  results.push({name:'scroll position retained through preview changes',result:'PASS'});
  await page.getByRole('button',{name:'Ancestor contexts',exact:true}).click();
  await stableHover('notary','[data-row-id="storage"]');
  await stableHover('nav','[data-row-id="deep"]',1);
  await stableHover('storage','[data-row-id="storage-note"]',1);
  await page.getByRole('button',{name:'Sibling contexts',exact:true}).click();
  check(await page.locator('[data-row-id="nav"]').count() === 1 && await page.locator('[data-row-id="storage"]').count() === 1, 'Compressed sibling control did not jump directly to current siblings');
  results.push({name:'compressed ancestors stay interactive and siblings are directly accessible',result:'PASS'});
  await page.evaluate(()=>{mock.delays.nav=800;});
  await page.locator('[data-row-id="nav"]').hover();
  await page.waitForTimeout(220);
  await page.locator('[data-row-id="storage"]').hover();
  await page.locator('[data-row-id="storage-note"]').waitFor();
  await page.waitForTimeout(850);
  check(await page.locator('[data-row-id="deep"]').count() === 0, 'Late response replaced newer sibling context');
  results.push({name:'late child response cannot overwrite a newer sibling',result:'PASS'});
  const geometryCalls = await page.evaluate(()=>mock.calls.filter(c=>c.command==='set_anchor_expanded'));
  check(geometryCalls.filter(c=>c.args.expanded).every(c=>c.args.height===420), 'Hover requested variable native geometry');
  results.push({name:'native geometry requests independent of hover/depth',result:'PASS',calls:geometryCalls});
  await page.getByRole('button',{name:'All contexts',exact:true}).click();
  await page.locator('[data-row-id="coding"]').click();
  await page.getByRole('button',{name:'New child context',exact:true}).click();
  await page.getByLabel('Context name',{exact:true}).fill('Child made by UI');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  check(await page.evaluate(()=>mock.calls.some(c=>c.command==='create_project' && c.args.name==='Child made by UI' && c.args.parent_id==='coding')), 'Child form lost its selected parent');
  results.push({name:'minimal child creation uses explicit parent',result:'PASS'});
  await page.getByRole('button',{name:'Close retrieval',exact:true}).click();
  await page.waitForTimeout(50);
  check(await page.locator('.ambient-panel').count() === 0,'Close did not snap back to ambient');
  results.push({name:'close returns to ambient',result:'PASS'});
  return results;
}
