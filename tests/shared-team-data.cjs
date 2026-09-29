const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {harness} = require('./reliability.cjs');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const logo = 'https://example.test/virginia.png';
const teamData = [{school:'Virginia',logos:[logo,'https://example.test/alternate.png'],conference:'ACC'}, {school:'No Logo'}];
const response = data => ({ok:true,json:async()=>data});
function frontend(fetch) {
 const ctx={fetch,document:{getElementById:()=>({appendChild(){}}),createElement:()=>({})}};
 vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf('const supportsHover')),ctx);return ctx;
}
async function main(){
 let count=0;
 const check=async(name,fn)=>{await fn();count++;console.log('PASS',name)};
 for(const order of [['fetchFBSTeamNames','fetchTeamLogos'],['fetchTeamLogos','fetchFBSTeamNames']])await check(order.join(' then ')+' uses one request',async()=>{
  let calls=0;const ctx=frontend(async url=>{calls++;assert.equal(url,'/api/teams?year=2026');return response(teamData)});
  await ctx[order[0]](2026);await ctx[order[1]]('2026');await ctx.fetchTeamLogos(2026);assert.equal(calls,1);
 });
 await check('concurrent membership, logos and metadata share one pending request',async()=>{
  let calls=0,release;const gate=new Promise(r=>release=r);
  const ctx=frontend(async()=>{calls++;await gate;return response(teamData)});
  const pending=[ctx.fetchFBSTeamNames(2026),ctx.fetchTeamLogos(2026),ctx.fetchFBSTeams(2026)];assert.equal(calls,1);release();
  const [names,logos,teams]=await Promise.all(pending);assert.ok(names.has('Virginia'));assert.equal(logos.Virginia,logo);assert.equal(teams[0].conference,'ACC');
 });
 await check('season-specific membership and logos remain separate',async()=>{
  const calls=[];const ctx=frontend(async url=>{calls.push(url);const year=new URL(url,'https://test').searchParams.get('year');
   const teams=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/fbs-'+year+'.json'),'utf8'));
   teams.find(t=>t.school==='Virginia').logos=['https://example.test/'+year+'.png'];return response(teams);
  });
  const y25=await ctx.fetchFBSTeamNames(2025),logos26=await ctx.fetchTeamLogos(2026),y26=await ctx.fetchFBSTeamNames(2026),logos25=await ctx.fetchTeamLogos(2025);
  assert.ok(y26.has('North Dakota State'));assert.ok(!y26.has('North Dakota'));assert.ok(!y25.has('Sacramento State'));
  assert.equal(logos25.Virginia,'https://example.test/2025.png');assert.equal(logos26.Virginia,'https://example.test/2026.png');assert.equal(calls.length,2);
 });
 for(const [name,fail] of [['429',()=>({ok:false,status:429})],['malformed',()=>response([{}])],['network',()=>{throw Error('offline')}]])await check(name+' shared failure allows retry from other consumer',async()=>{
  let calls=0;const ctx=frontend(async()=>++calls===1?fail():response(teamData));
  const results=await Promise.allSettled([ctx.fetchTeamLogos(2026),ctx.fetchFBSTeamNames(2026)]);
  assert.ok(results.every(r=>r.status==='rejected'));assert.equal(calls,1);
  assert.ok((await ctx.fetchFBSTeamNames(2026)).has('Virginia'));assert.equal((await ctx.fetchTeamLogos(2026)).Virginia,logo);assert.equal(calls,2);
 });
 await check('first logo remains available, missing logos omitted, derived maps isolated',async()=>{
  const ctx=frontend(async()=>response(teamData));const logos=await ctx.fetchTeamLogos(2026);
  assert.equal(logos.Virginia,logo);assert.ok(!Object.hasOwn(logos,'No Logo'));logos.Virginia='changed';
  (await ctx.fetchFBSTeamNames(2026)).clear();assert.equal((await ctx.fetchTeamLogos(2026)).Virginia,logo);assert.ok((await ctx.fetchFBSTeamNames(2026)).has('Virginia'));
 });
 await check('ranking load renders logos with one cold teams request and zero warm requests',async()=>{
  const h=harness({hook:async url=>url.startsWith('/api/teams')?response(teamData):undefined});
  await h.load(2);assert.match(h.html(),/class="team-logo"/);assert.ok(h.html().includes(logo));
  assert.deepEqual(h.state.requests.filter(u=>u.startsWith('/api/teams')),['/api/teams?year=2026']);
  await h.load(3);assert.ok(h.html().includes(logo));assert.equal(h.state.requests.filter(u=>u.startsWith('/api/teams')).length,1);
  await h.load(2,'2025');assert.deepEqual(h.state.requests.filter(u=>u.startsWith('/api/teams')),['/api/teams?year=2026','/api/teams?year=2025']);
 });
 console.log('TOTAL',count,'shared team-data checks passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
