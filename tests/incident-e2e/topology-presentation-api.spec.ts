import { randomUUID } from 'node:crypto';
import { expect, request as apiRequest } from '@playwright/test';
import { test, signIn } from './fixtures';
import { PRESENTATION_KEY, type TopologyPresentation } from '../../lib/topology/presentation';

test('presentation API: real storage, simultaneous revisions, replay, permission denial and inventory preservation',async({page,fixtures,prisma})=>{
  const suffix=randomUUID(), organization=await prisma.organization.create({data:{name:`TEST visual ${suffix}`,code:`visual-${suffix}`}});
  const previous=await prisma.systemConfig.findUnique({where:{key:PRESENTATION_KEY}});
  const before={devices:await prisma.device.count(),links:await prisma.buildingConnection.count(),legacy:await prisma.systemConfig.findMany({where:{key:{startsWith:'network.topology.building-position:'}},orderBy:{key:'asc'}})};
  const endpoint='/api/network/topology-presentation';
  try {
    // The runner requires a disposable database. Never reuse a live application's config.
    await prisma.systemConfig.deleteMany({where:{key:PRESENTATION_KEY}});
    const a=await prisma.building.create({data:{name:'TEST A',address:'Fixture',city:'Fixture',country:'TR',organizationId:organization.id}});
    const b=await prisma.building.create({data:{name:'TEST B',address:'Fixture',city:'Fixture',country:'TR',organizationId:organization.id}});
    const document:TopologyPresentation={version:1,backboneIds:[a.id],sections:[{id:'visual',name:'İlk bölüm',buildingIds:[b.id]}],positions:{},pinned:{}};
    await signIn(page,fixtures);
    expect((await page.request.get(endpoint)).status()).toBe(200);
    const put=(baseRevision:number,doc=document)=>page.request.put(endpoint,{data:{baseRevision,document:doc}});
    expect((await put(0)).status()).toBe(200);
    expect((await (await put(0)).json()).data.revision).toBe(1);
    const second={...document,sections:[{...document.sections[0],name:'İkinci bölüm'}]}, third={...document,sections:[{...document.sections[0],name:'Üçüncü bölüm'}]};
    const concurrent=await Promise.all([put(1,second),put(1,third)]);
    expect(concurrent.map(r=>r.status()).sort()).toEqual([200,409]);
    expect(JSON.parse((await prisma.systemConfig.findUniqueOrThrow({where:{key:PRESENTATION_KEY}})).value).revision).toBe(2);
    expect((await put(2,{...document,backboneIds:[b.id]})).status()).toBe(400);
    const persisted=(await prisma.systemConfig.findUniqueOrThrow({where:{key:PRESENTATION_KEY}})).value;
    await prisma.user.update({where:{id:fixtures.userId},data:{role:'VIEWER'}});
    expect((await put(2,document)).status()).toBe(403);
    expect((await (await page.request.get(endpoint)).json()).data.canEdit).toBe(false);
    await prisma.user.update({where:{id:fixtures.userId},data:{status:'INACTIVE'}});
    expect((await put(2,document)).status()).toBe(401);
    expect((await prisma.systemConfig.findUniqueOrThrow({where:{key:PRESENTATION_KEY}})).value).toBe(persisted);
    const anonymous=await apiRequest.newContext({baseURL:new URL(page.url()).origin});
    try {expect((await anonymous.put(endpoint,{data:{baseRevision:2,document}})).status()).toBe(401);}finally{await anonymous.dispose();}
    expect(await prisma.device.count()).toBe(before.devices);expect(await prisma.buildingConnection.count()).toBe(before.links);
    expect(await prisma.systemConfig.findMany({where:{key:{startsWith:'network.topology.building-position:'}},orderBy:{key:'asc'}})).toEqual(before.legacy);
  } finally {
    await prisma.user.update({where:{id:fixtures.userId},data:{role:'ADMIN',status:'ACTIVE'}});
    if(previous)await prisma.systemConfig.upsert({where:{key:PRESENTATION_KEY},create:{key:PRESENTATION_KEY,value:previous.value},update:{value:previous.value}});
    else await prisma.systemConfig.deleteMany({where:{key:PRESENTATION_KEY}});
    await prisma.organization.delete({where:{id:organization.id}});
  }
});
