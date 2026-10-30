import { expect, type Page } from '@playwright/test';
import { test, signIn } from './fixtures';
import fixture from '../../scripts/fixtures/topology-workspace.cjs';
import { suggestPresentation, type TopologyPresentation } from '../../lib/topology/presentation';

const buildings = Array.from({ length:32 }, (_, i) => ({ id:`visual-${i}`, name:`TEST · Bina ${String(i).padStart(2,'0')}`, organizationId:'test-org', floors:[] }));
const links = Array.from({ length:31 }, (_, i) => ({ id:`visual-link-${i}`, sourceBuildingId:buildings[i].id, destBuildingId:buildings[i+1].id })).concat([
  { id:'visual-cycle-one',sourceBuildingId:buildings[0].id,destBuildingId:buildings[10].id },
  { id:'visual-cycle-two',sourceBuildingId:buildings[10].id,destBuildingId:buildings[31].id },
]).map(link => ({ ...link, sourceBuilding:buildings.find(b => b.id === link.sourceBuildingId),destBuilding:buildings.find(b => b.id === link.destBuildingId),connectionType:'OTHER',status:'UNKNOWN',bandwidth:null,recordingMethod:'MANUAL' }));
const devices = Array.from({ length:94 }, (_, i) => ({ ...fixture.devices[0], id:`visual-device-${i}`, name:`TEST · Cihaz ${i}`, rack:null, buildingId:buildings[i%32].id, managementIp:`192.0.2.${i+1}`, networkInterfaces:[] }));
type Failure = number | 'lost' | null;
async function visualFixture(page: Page, saved = false, failure: Failure = null) {
  let document: TopologyPresentation | null = saved ? suggestPresentation(buildings,links) : null, revision = saved ? 1 : 0, attempts = 0;
  let gate: Promise<void> | null = null, release: (() => void) | null = null;
  const writes: string[] = [];
  await page.addInitScript(() => { if (sessionStorage.getItem('flat-fixture-initialized')) return; sessionStorage.setItem('flat-fixture-initialized','1'); localStorage.clear(); localStorage.setItem('infrascope:topology:navigation:v1:map', JSON.stringify({version:1,viewport:{x:50,y:50,zoom:.17}})); });
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/auth/')) return route.continue();
    if (pathname === '/api/network/topology-presentation') {
      if (request.method() === 'GET') return route.fulfill({ json:{success:true,data:{document,revision,canEdit:true}} });
      writes.push(pathname); attempts++; const body = request.postDataJSON();
      if (gate) await gate;
      if (attempts === 1 && failure && failure !== 'lost') return route.fulfill({status:failure,json:{success:false,error:failure===401?'Oturum süreniz doldu.':failure===403?'Görünümü değiştirme yetkiniz yok.':failure===409?'Görünüm başka kullanıcı tarafından değiştirildi.':'Görünüm kaydedilemedi.'}});
      if (JSON.stringify(document) !== JSON.stringify(body.document)) { document = body.document; revision++; }
      if (attempts === 1 && failure === 'lost') return route.abort('connectionreset');
      return route.fulfill({json:{success:true,data:{document,revision,canEdit:true}}});
    }
    if (request.method() !== 'GET') { writes.push(pathname); return route.fulfill({status:405,json:{success:false,error:'Unexpected inventory write'}}); }
    const payloads: Record<string,unknown> = {
      '/api/devices':devices, '/api/organizations':[{...fixture.organizations[0],buildings}], '/api/services':[], '/api/network-connections':[],
      '/api/building-connections':{items:links}, '/api/network/topology-status':{devices:[]}, '/api/network/groups':{items:[],canManage:true},
      '/api/network/building-layout':{positions:{'building-visual-0':{x:10000,y:-10000}},canEdit:true},
      '/api/network/building-devices':{devices:devices.filter(d => d.buildingId===buildings[0].id),connections:[],canManage:true},
      '/api/network/building-device-layout':{positions:{},canEdit:true},
    };
    return pathname in payloads ? route.fulfill({json:{success:true,data:payloads[pathname]}}) : route.continue();
  });
  return { writes, hold: () => { gate=new Promise<void>(resolve=>{release=resolve;}); }, release: () => { gate=null;release?.(); }, get document() { return document; }, get revision() { return revision; } };
}

const map = (page: Page) => page.getByRole('region', {name:'Topoloji haritası', exact:true});
async function focusFirst(page: Page) {
  await page.getByRole('combobox',{name:'Topolojide bina veya cihaz ara',exact:true}).fill('TEST · Bina 00');
  await page.getByRole('option',{name:'TEST · Bina 00 Bina',exact:true}).click();
  await expect.poll(()=>map(page).locator('.react-flow__viewport').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThanOrEqual(.9);
  return map(page).locator('[data-id="building-visual-0"]');
}
async function editFirst(page: Page) {
  await page.getByRole('button',{name:'Haritayı düzenle',exact:true}).click();
  const node=await focusFirst(page); await node.click({position:{x:80,y:28}});
  await expect(page.getByRole('group',{name:'Seçili bina işlemleri'})).toBeVisible();
  return node;
}
async function options(page: Page) { await page.getByRole('button',{name:'Bina haritası seçenekleri',exact:true}).click(); }

test('flat map: 32 buildings/33 real paths, readable opening, compact tools and no view writes',async({page,fixtures})=>{
  const state=await visualFixture(page);await signIn(page,fixtures);await page.goto('/network');
  await expect(map(page)).toHaveAttribute('aria-busy','false');
  await expect(map(page).locator('.react-flow__node-building')).toHaveCount(32);
  await expect(map(page).locator('path.react-flow__edge-path')).toHaveCount(33);
  await expect(page.getByRole('navigation',{name:'Binalar ve görsel bölümler'})).toHaveCount(0);
  await expect(page.getByRole('complementary',{name:'Topoloji seçimi'})).toHaveCount(0);
  expect(await map(page).locator('.react-flow__viewport').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThanOrEqual(.65);
  expect((await page.getByRole('combobox',{name:'Topolojide bina veya cihaz ara',exact:true}).boundingBox())!.width).toBeLessThanOrEqual(300);
  await expect(page.getByText('Fiziksel bağlantı',{exact:true})).toHaveCount(0);
  await map(page).getByRole('button',{name:'Harita rehberi',exact:true}).click();
  await expect(page.getByText('Fiziksel bağlantı',{exact:true})).toBeVisible();
  await expect(page.getByText('Durum bilinmiyor:',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await focusFirst(page);
  await options(page);await page.getByRole('button',{name:'Bina ve ağ grubu listesi',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Bina ve ağ grubu listesi'})).toBeVisible();
  await page.getByRole('button',{name:'TEST · Bina 00',exact:true}).click();
  expect(state.writes).toEqual([]);expect(state.document).toBeNull();
});

test('flat map: view click opens the building, edit selection offers direct connection actions',async({page,fixtures})=>{
  const state=await visualFixture(page,true);const before=structuredClone(state.document);await signIn(page,fixtures);await page.goto('/network');
  const node=await focusFirst(page);await node.click({position:{x:80,y:28}});
  const dialog=page.getByRole('dialog',{name:'TEST · Bina 00',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Bu binada henüz cihaz bağlantısı kaydı yok.',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Bina harita rehberi',exact:true}).click();
  await expect(page.getByRole('group',{name:'Bina içi bağlantı türü filtreleri'})).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Haritayı düzenle',exact:true}).click();
  await dialog.locator('[data-id="visual-device-0"]').click({position:{x:40,y:22}});
  expect(state.writes).toEqual([]);
  await dialog.getByRole('button',{name:'Düzenlemeyi bitir',exact:true}).click();
  await dialog.getByRole('button',{name:'Bina görünümünü kapat',exact:true}).click();
  await editFirst(page);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Buradan bağlantı ekle',exact:true}).click();
  const form=page.getByRole('dialog',{name:'Bina Bağlantısı Ekle'});await expect(form.locator('#sourceBuilding')).toContainText('TEST · Bina 00');
  await expect(form.locator('#notes')).toBeHidden();await form.getByText('Ek ayrıntılar',{exact:true}).click();await expect(form.locator('#notes')).toBeVisible();
  await form.getByRole('button',{name:'İptal',exact:true}).click();
  expect(state.document).toEqual(before);expect(state.writes).toEqual([]);
});

for(const failure of [503,401,403,'lost'] as const){
  test(`flat map: ${failure} retains moved position and retries exactly once`,async({page,fixtures})=>{
    const state=await visualFixture(page,true,failure),oldSections=structuredClone(state.document!.sections);
    await signIn(page,fixtures);await page.goto('/network');const node=await editFirst(page);
    const box=(await node.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+26);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+76,{steps:8});await page.mouse.up();
    await expect(page.getByRole('region',{name:'Dengeli bina topolojisi',exact:true}).getByRole('alert')).toContainText('korunuyor');
    const position=await node.getAttribute('style');await expect(page.getByRole('dialog')).toHaveCount(0);
    if(failure!=='lost')expect(state.document!.positions.all).toBeUndefined();
    await page.getByRole('button',{name:'Yeniden dene',exact:true}).click();await expect(page.getByText('Görünüm kaydedildi',{exact:true})).toBeVisible();
    expect(state.revision).toBe(2);expect(state.document!.sections).toEqual(oldSections);
    await page.reload();await expect(map(page).locator('[data-id="building-visual-0"]')).toHaveAttribute('style',position!);
    expect(state.writes).toEqual(['/api/network/topology-presentation','/api/network/topology-presentation']);
  });
}

test('flat map: pin, auto layout preview/cancel, apply and undo preserve real data and old scopes',async({page,fixtures})=>{
  const state=await visualFixture(page,true),old=structuredClone(state.document!);await signIn(page,fixtures);await page.goto('/network');await editFirst(page);
  await page.getByRole('button',{name:'Konumu sabitle',exact:true}).click();await expect(page.getByText('Görünüm kaydedildi',{exact:true})).toBeVisible();
  const point=structuredClone(state.document!.positions.all['building-visual-0']),writes=state.writes.length;
  await options(page);await page.getByRole('button',{name:'Otomatik düzenle',exact:true}).click();await expect(page.getByText('Yerleşim önizlemesi',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(writes);
  await page.getByRole('button',{name:'Vazgeç',exact:true}).click();expect(state.writes).toHaveLength(writes);
  await options(page);await page.getByRole('button',{name:'Otomatik düzenle',exact:true}).click();await page.getByRole('button',{name:'Yerleşimi uygula',exact:true}).click();await expect(page.getByText('Görünüm kaydedildi',{exact:true})).toBeVisible();
  expect(state.document!.positions.all['building-visual-0']).toEqual(point);
  await page.getByRole('button',{name:'Geri al',exact:true}).click();await expect(page.getByText('Görünüm kaydedildi',{exact:true})).toBeVisible();
  expect(state.document!.positions.all['building-visual-0']).toEqual(point);expect(state.document!.sections).toEqual(old.sections);expect(state.document!.positions.summary).toEqual(old.positions.summary);
  expect(state.writes.every(path=>path==='/api/network/topology-presentation')).toBe(true);
});

test('flat map: stale revision preserves the draft and requires explicit server adoption',async({page,fixtures})=>{
  const state=await visualFixture(page,true,409);await signIn(page,fixtures);await page.goto('/network');await editFirst(page);await page.getByRole('button',{name:'Konumu sabitle',exact:true}).click();
  await expect(page.getByRole('region',{name:'Dengeli bina topolojisi'}).getByRole('alert')).toContainText('başka kullanıcı');
  await page.getByRole('button',{name:'Güncel görünümü incele',exact:true}).click();await page.getByRole('button',{name:'Sunucu görünümüne geç',exact:true}).click();
  await page.getByText('Önceki taslak ayrıntıları',{exact:true}).click();await expect(page.locator('pre')).toContainText('building-visual-0');expect(state.revision).toBe(1);expect(state.writes).toHaveLength(1);
});

test('flat map: deliberate zoom survives reload and ignores the old summary camera',async({page,fixtures})=>{
  await visualFixture(page,true);await signIn(page,fixtures);await page.goto('/network');await expect(map(page)).toHaveAttribute('aria-busy','false');await focusFirst(page);
  await page.getByRole('button',{name:'Haritayı uzaklaştır',exact:true}).click();await page.getByRole('button',{name:'Haritayı uzaklaştır',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('infrascope:topology:flat-camera:v1')||'null')?.zoom)).toBeCloseTo(.7638889,5);
  const camera=await map(page).locator('.react-flow__viewport').getAttribute('style');await page.reload();await expect(map(page).locator('[data-id="building-visual-0"]')).toHaveClass(/selected/);await expect(map(page).locator('.react-flow__viewport')).toHaveAttribute('style',camera!);
});

for(const width of [1440,390])test(`flat map: ${width}px fullscreen, guide Escape and rendered links`,async({page,fixtures})=>{
  await page.setViewportSize({width,height:1000});const state=await visualFixture(page,true);await signIn(page,fixtures);await page.goto('/network');await expect(map(page)).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Haritayı tam ekran yap',exact:true}).click();await expect(page.getByRole('button',{name:'Tam ekrandan çık',exact:true})).toBeVisible();
  await map(page).getByRole('button',{name:'Harita rehberi',exact:true}).click();await expect(page.getByRole('group',{name:'Binalar arası bağlantı türü filtreleri'})).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('group',{name:'Binalar arası bağlantı türü filtreleri'})).toHaveCount(0);
  // Native browser Escape may also leave fullscreen. A second Escape must be
  // harmless in normal mode, or close the remaining page expansion otherwise.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Haritayı tam ekran yap',exact:true})).toBeVisible();await expect(map(page).locator('path.react-flow__edge-path')).toHaveCount(33);expect(state.writes).toEqual([]);
});

test('flat map: legacy layout outage does not block presentation editing',async({page,fixtures})=>{
  await visualFixture(page,true);await page.route('**/api/network/building-layout',route=>route.fulfill({status:503,json:{success:false,error:'Legacy layout offline'}}));await signIn(page,fixtures);await page.goto('/network');
  await expect(map(page)).toHaveAttribute('aria-busy','false');await expect(page.getByRole('button',{name:'Haritayı düzenle',exact:true})).toBeEnabled();
});

test('flat map: failed draft survives detailed view navigation',async({page,fixtures})=>{
  const state=await visualFixture(page,true,503);await signIn(page,fixtures);await page.goto('/network');await editFirst(page);await page.getByRole('button',{name:'Konumu sabitle',exact:true}).click();
  await expect(page.getByRole('region',{name:'Dengeli bina topolojisi'}).getByRole('alert')).toContainText('korunuyor');
  await options(page);await page.getByRole('button',{name:'Ayrıntılı görünüm',exact:true}).click();await page.getByRole('button',{name:'Dengeli görünüme dön',exact:true}).click();
  await expect(page.getByRole('region',{name:'Dengeli bina topolojisi'}).getByRole('alert')).toContainText('korunuyor');
  await page.getByRole('button',{name:'Yeniden dene',exact:true}).click();await expect(page.getByText('Görünüm kaydedildi',{exact:true})).toBeVisible();expect(state.document!.pinned.all).toContain('building-visual-0');expect(state.revision).toBe(2);
});

test('flat map: queued drags finish across detailed map navigation',async({page,fixtures})=>{
  const state=await visualFixture(page,true);await signIn(page,fixtures);await page.goto('/network');const node=await editFirst(page);state.hold();
  const drag=async()=>{const b=(await node.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+26);await page.mouse.down();await page.mouse.move(b.x+b.width/2+55,b.y+61,{steps:6});await page.mouse.up();};
  try { await drag();await expect.poll(()=>state.writes.length).toBe(1);await drag();
    await options(page);await page.getByRole('button',{name:'Ayrıntılı görünüm',exact:true}).click();state.release();await expect.poll(()=>state.revision).toBe(3);
    await page.getByRole('button',{name:'Dengeli görünüme dön',exact:true}).click();await expect(page.getByText('Görünüm kaydedildi',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(2);
  } finally { state.release(); }
});
