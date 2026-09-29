const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { endpoint, harness } = require('./reliability.cjs');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const response = data => ({ok:true, json:async()=>data});
const members = [{school:'North Dakota State'}];
function frontend(fetch) {
  const ctx={fetch,document:{getElementById:()=>({appendChild(){}}),createElement:()=>({})}};
  vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf('const supportsHover')),ctx);return ctx;
}
async function main(){
 let count=0;
 const check=async(name,fn)=>{await fn();console.log('PASS',name);count++};
 await check('same year reused and numeric/string year share a key',async()=>{
  let calls=0;const ctx=frontend(async url=>{calls++;assert.equal(url,'/api/teams?year=2026');return response(members)});
  await ctx.fetchFBSTeamNames(2026);await ctx.fetchFBSTeamNames('2026');await ctx.fetchFBSTeamNames(2026);assert.equal(calls,1);
 });
 await check('distinct seasons retain fixture membership and cache independently',async()=>{
  const calls=[];const ctx=frontend(async url=>{calls.push(url);const year=new URL(url,'https://test').searchParams.get('year');return response(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/fbs-'+year+'.json'),'utf8')))});
  const y25=await ctx.fetchFBSTeamNames(2025),y26=await ctx.fetchFBSTeamNames(2026);
  assert.ok(y26.has('North Dakota State'));assert.ok(!y26.has('North Dakota'));assert.ok(!y25.has('Sacramento State'));assert.ok(!y25.has('North Dakota State'));
  await ctx.fetchFBSTeamNames(2025);await ctx.fetchFBSTeamNames(2026);assert.equal(calls.length,2);
 });
 await check('concurrent same year shares one request; other season proceeds independently',async()=>{
  let release,calls=0;const gate=new Promise(r=>release=r);
  const ctx=frontend(async url=>{calls++;if(url.endsWith('2026'))await gate;return response(members)});
  const requests=[ctx.fetchFBSTeamNames(2026),ctx.fetchFBSTeamNames('2026'),ctx.fetchFBSTeamNames(2026)];
  assert.equal(calls,1);await ctx.fetchFBSTeamNames(2025);assert.equal(calls,2);release();
  for(const result of await Promise.all(requests))assert.ok(result.has('North Dakota State'));
 });
 for(const [name,fail] of [
  ['429',async()=>({ok:false,status:429})],['network',async()=>{throw Error('offline')}],
  ['invalid JSON',async()=>({ok:true,json:async()=>{throw Error('JSON')}})],
  ...[null,{},[],[null],[{}],[{school:12}],[{school:' '}]].map((data,i)=>['malformed '+i,async()=>response(data)])
 ])await check(name+' is not cached and allows retry',async()=>{
  let calls=0;const ctx=frontend(async()=>++calls===1?fail():response(members));
  await assert.rejects(ctx.fetchFBSTeamNames(2026));assert.ok((await ctx.fetchFBSTeamNames(2026)).has('North Dakota State'));
  await ctx.fetchFBSTeamNames(2026);assert.equal(calls,2);
 });
 await check('concurrent failure rejects all callers and next attempt retries',async()=>{
  let calls=0;const ctx=frontend(async()=>++calls===1?{ok:false,status:429}:response(members));
  const results=await Promise.allSettled([ctx.fetchFBSTeamNames(2026),ctx.fetchFBSTeamNames(2026)]);
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal(calls,1);await ctx.fetchFBSTeamNames(2026);assert.equal(calls,2);
 });
 await check('caller mutation cannot corrupt cached membership',async()=>{
  const ctx=frontend(async()=>response(members));(await ctx.fetchFBSTeamNames(2026)).clear();assert.ok((await ctx.fetchFBSTeamNames(2026)).has('North Dakota State'));
 });
 await check('successful server responses retain year and receive CDN headers',async()=>{
  for(const query of [{year:'2025'},{year:'2026'},{}]){
   const out=await endpoint('teams.js',query,async url=>{assert.equal(new URL(url).searchParams.get('year'),query.year||null);return response(members)});
   assert.equal(out.status,200);assert.equal(out.headers['Cache-Control'],'public, max-age=0, s-maxage=21600, stale-while-revalidate=3600');
  }
 });
 for(const status of [429,500,401])await check('upstream '+status+' preserved with no-store',async()=>{
  const out=await endpoint('teams.js',{year:'2026'},async()=>({ok:false,status}));assert.equal(out.status,status);assert.equal(out.headers['Cache-Control'],'no-store');
 });
 await check('malformed server payloads and network failures never cached',async()=>{
  for(const fetch of [async()=>{throw Error('network')},async()=>({ok:true,json:async()=>{throw Error('JSON')}}),
   ...[null,{},[],[null],[{}],[{school:2}],[{school:''}]].map(data=>async()=>response(data))]){
   const out=await endpoint('teams.js',{year:'2026'},fetch);assert.equal(out.status,502);assert.equal(out.headers['Cache-Control'],'no-store');
  }
 });
 await check('invalid year is not fetched or cached',async()=>{
  const out=await endpoint('teams.js',{year:'bad'},()=>{throw Error('must not fetch')});assert.equal(out.status,400);assert.equal(out.headers['Cache-Control'],'no-store');
 });
 await check('ranking load handles membership 429 gracefully and later retries',async()=>{
  let fail=true;const h=harness({hook:async url=>url.startsWith('/api/teams?')&&fail?{ok:false,status:429}:undefined});
  await h.load(2);assert.match(h.html(),/Unable to load rankings/);fail=false;await h.load(2);assert.doesNotMatch(h.html(),/Unable to load rankings/);assert.match(h.html(),/Notre Dame/);
 });
 console.log('TOTAL',count,'membership cache checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
