/* eslint-disable @typescript-eslint/no-require-imports -- Execute navigation filtering without a browser/database. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const file=path.resolve('lib/topology/presentation-navigation.ts');
assert.ok(fs.existsSync(file),'Visual section navigation must support section-name searches');
function load(filename){const loaded=new Module(filename,module);loaded.require=name=>load(path.resolve(path.dirname(filename),`${name}.ts`));loaded._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);return loaded.exports;}
const {filterPresentationNavigation}=load(file);
const buildings=[{id:'one',name:'İskele'},{id:'two',name:'Kültür'},{id:'three',name:'Şükrü Çavuş'}];
const document={version:1,backboneIds:['one'],sections:[{id:'parks',name:'Parklar bölümü',buildingIds:['two']},{id:'empty',name:'Boş bölüm',buildingIds:[]}],positions:{},pinned:{}};
const before=JSON.stringify(document);
assert.deepEqual(filterPresentationNavigation(document,buildings,'PARKLAR').sections,[{id:'parks',name:'Parklar bölümü',buildingIds:['two']}]);
assert.deepEqual(filterPresentationNavigation(document,buildings,'kultur').sections,[{id:'parks',name:'Parklar bölümü',buildingIds:['two']}]);
assert.deepEqual(filterPresentationNavigation(document,buildings,'iskele').backboneIds,['one']);
assert.deepEqual(filterPresentationNavigation(document,buildings,'sukru cavus').unplacedIds,['three']);
assert.deepEqual(filterPresentationNavigation(document,buildings,'bos bolum').sections,[{id:'empty',name:'Boş bölüm',buildingIds:[]}]);
assert.equal(filterPresentationNavigation(document,buildings,'missing').sections.length,0);
assert.equal(JSON.stringify(document),before,'Search never changes shared membership');
console.log('Presentation navigation passed: visual section names, member names, Turkish/ASCII spelling, backbone, unplaced and empty sections; immutable membership.');
