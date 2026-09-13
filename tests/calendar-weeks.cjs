const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'script.js'),'utf8');
const old = cp.execFileSync('git',['-c','safe.directory='+repo.replaceAll('\\','/'),'-C',repo,'show','HEAD:script.js'],{encoding:'utf8'});
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name)}
function element(){return {value:'',options:[],children:[],classList:{add(){}},addEventListener(){},appendChild(c){this.children.push(c);if(c.tag==='option'){this.options.push(c);if(!this.value)this.value=c.value}},set innerHTML(v){this.html=v;this.children=[]},get innerHTML(){return this.html||''}}}
function harness(games,names,now='2026-09-12T12:00:00Z',text=source){
 const elements={year:element(),'week-select':element(),rankings:element()};
 elements['week-select'].options=['all',...Array.from({length:16},(_,i)=>String(i))].map(value=>({value,disabled:false}));
 elements['week-select'].value='all';
 const state={games,names,official:[{polls:[{poll:'AP Top 25',ranks:Array.from({length:25},(_,i)=>({school:'AP '+(i+1),rank:i+1}))}]}],failAP:false};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return new Date(now).getTime()}}
 const ctx={Date:Clock,console:{log(){},error(){}},document:{getElementById(id){return elements[id]??=element()},createElement(tag){return {...element(),tag}},addEventListener(){}},window:{matchMedia:()=>({matches:false}),addEventListener(){}},
 fetch:async url=>({json:async()=>{if(url.startsWith('/api/games'))return state.games;if(url==='/api/teams')return state.names.map(school=>({school}));if(state.failAP)throw Error('AP unavailable');return state.official}})};
 vm.createContext(ctx);vm.runInContext(text,ctx);
 return {ctx,state,elements};
}
const game=(week,homeTeam,awayTeam,homePoints,awayPoints,awayClassification='fbs')=>({week,homeTeam,awayTeam,homePoints,awayPoints,homeClassification:'fbs',awayClassification,startDate:['2026-08-29','2026-09-05','2026-09-12','2026-09-19'][week-1]+'T12:00:00Z',startTimeTBD:false,completed:homePoints!==null&&awayPoints!==null});
const games=[game(1,'A','FCS',10,0,'fcs'),game(1,'North Dakota State','FCS2',10,0,'fcs'),game(1,'Alabama','B',10,0),game(1,'Notre Dame','C',10,0),game(2,'A','North Dakota State',0,10),game(2,'Alabama','FCS',10,0,'fcs'),game(2,'Notre Dame','B',10,0),game(2,'C','D',10,0),game(3,'B','D',10,0),game(4,'Alabama','Notre Dame',null,null)];
const names=['A','B','C','D','Alabama','Notre Dame','North Dakota State'];
(async()=>{
const h=harness(games,names);await new Promise(r=>setImmediate(r));
const {ctx,elements,state}=h;
check('initial dropdown disables future calendar windows',()=>{assert.equal(elements['week-select'].options.find(o=>o.value==='3').disabled,true);assert.equal(elements['week-select'].options.find(o=>o.value==='2').disabled,false)});
check('2026 cumulative calendar windows for Weeks 0/1/2/3',()=>{for(let w=0;w<=3;w++)assert.deepEqual([...new Set(games.filter(g=>ctx.getPollZeroWeek(g,2026)<=w).map(g=>g.week))],Array.from({length:w+1},(_,i)=>i+1))});
check('2025 API week mapping is unchanged',()=>{for(let w=0;w<=4;w++)assert.equal(ctx.getPollZeroWeek({week:w},2025),w)});
check('2026 availability begins at calendar boundary with zero completed games',()=>{
 const pending=[{week:99,startDate:'2026-09-17T23:30:00Z',completed:false,startTimeTBD:false}];
 assert.equal(ctx.getAvailablePollZeroWeek(pending,2026,Date.parse('2026-09-12T12:00:00Z')),2);
 assert.equal(ctx.getAvailablePollZeroWeek(pending,2026,Date.parse('2026-09-15T04:59:59Z')),2);
 assert.equal(ctx.getAvailablePollZeroWeek(pending,2026,Date.parse('2026-09-15T05:00:00Z')),3);
 assert.equal(ctx.getAvailablePollZeroWeek([],2026,Date.parse('2026-08-26T12:00:00Z')),-1);
});
check('calendar edges, UTC crossing, and API-number independence',()=>{
 for(const [date,expected] of [['2026-08-27T05:00:00Z',0],['2026-09-01T04:59:59Z',0],['2026-09-01T05:00:00Z',1],['2026-09-08T04:59:59Z',1],['2026-09-08T05:00:00Z',2],['2026-09-15T04:59:59Z',2],['2026-09-15T05:00:00Z',3],['2026-09-22T05:00:00Z',4],['2026-11-03T05:59:59Z',9],['2026-11-03T06:00:00Z',10]]) assert.equal(ctx.getPollZeroWeek({week:99,startDate:date},2026),expected,date);
 assert.ok(Number.isNaN(ctx.getPollZeroWeek({week:2,startDate:null},2026)));
 assert.equal(ctx.getPollZeroWeek({week:1,startDate:'2026-09-05T12:00:00Z'},2026),1);
});
const build=ctx.buildPollZeroRankings;let calls=[];ctx.buildPollZeroRankings=(...args)=>{calls.push({week:args[1],weeks:[...new Set(args[0].map(g=>g.week))]});return build(...args)};
const load=async w=>{calls=[];elements.year.value='2026';elements['week-select'].value=String(w);await ctx.loadRankings();return elements.rankings.innerHTML+elements.rankings.children.map(c=>c.innerHTML).join('')};
let html=await load(0);check('Week 0 returns without calculation',()=>{assert.match(html,/No Poll Zero rankings for Week 0/);assert.equal(calls.length,0)});
html=await load(1);check('Week 1 AP only',()=>{assert.equal(elements.rankings.children.length,25);assert.match(html,/AP 1/);assert.equal(calls.length,0);assert.doesNotMatch(html,/class="(?:up|down|same|new)"/)});
state.official=[];html=await load(1);check('Week 1 missing AP does not fall through',()=>{assert.match(html,/unavailable/);assert.equal(calls.length,0)});
state.failAP=true;html=await load(1);check('Week 1 failed AP request shows unavailable',()=>{assert.match(html,/unavailable/);assert.equal(calls.length,0)});state.failAP=false;
html=await load(2);check('Week 2 preview, no movement, cumulative calendar input',()=>{assert.match(html,/Poll Zero Preview/);assert.doesNotMatch(html,/class="(?:up|down|same|new)"/);assert.deepEqual(calls,[{week:'2',weeks:[1,2,3]}]);assert.match(html,/Alabama/);assert.match(html,/Notre Dame/)});
html=await load(3);check('future Week 3 refuses all calculation',()=>{assert.match(html,/has not started/);assert.equal(calls.length,0)});
const later=harness(games,names,'2026-09-15T05:00:00Z');await new Promise(r=>setImmediate(r));later.elements['week-select'].value='3';const laterBuild=later.ctx.buildPollZeroRankings;const laterCalls=[];later.ctx.buildPollZeroRankings=(...args)=>{laterCalls.push({week:args[1],weeks:[...new Set(args[0].map(g=>g.week))]});return laterBuild(...args)};await later.ctx.loadRankings();html=later.elements.rankings.children.map(c=>c.innerHTML).join('');
check('available Week 3 compares PZ Week 2 and renders normally',()=>{assert.deepEqual(laterCalls,[{week:2,weeks:[1,2,3]},{week:'3',weeks:[1,2,3,4]}]);assert.doesNotMatch(html,/Poll Zero Preview/);assert.match(html,/class="same"/)});
const rankings=build(games.filter(g=>g.week<=3),2,new Set(names));
check('NDSU eligible; true FCS excluded; FCS loss -55 and win +5 unchanged',()=>{assert.ok(rankings.some(t=>t.name==='North Dakota State'));assert.ok(!rankings.some(t=>t.name==='FCS'));assert.equal(rankings.find(t=>t.name==='A').score,5);const loss=build([game(1,'A','FCS',0,10,'fcs')],1,new Set(['A']))[0];assert.equal(loss.score,-55);assert.equal(loss.totalOpponentWins,1);assert.equal(loss.totalOpponentLosses,11)});
check('opponent strength metrics use window records and FCS override',()=>{const a=rankings.find(t=>t.name==='A');assert.equal(a.totalOpponentWins,3);assert.equal(a.totalOpponentLosses,11);assert.equal(a.opponentWinPct,3/14);assert.equal(a.bestOpponentWins,2);assert.equal(a.teamWinPct,0.5);assert.equal(a.rating,2.5)});
check('all five sorting criteria have strict precedence',()=>{
 const comparator=vm.runInContext(source.match(/return eligibleTeams.sort\(([\s\S]*?)\n  \);/)[1],ctx);
 const keys=['avgScore','teamWinPct','opponentWinPct','bestOpponentWins'];
 // Each criterion must beat every lower-priority criterion, including name.
 for(let i=0;i<keys.length;i++){
  const a={name:'Zulu'},b={name:'Alpha'};
  keys.forEach((key,j)=>{a[key]=j===i?2:1;b[key]=j>i?3:1});
  assert.ok(comparator(a,b)<0,keys[i]);
  assert.ok(comparator(b,a)>0,keys[i]);
 }
 const base={avgScore:1,teamWinPct:0.5,opponentWinPct:0.5,bestOpponentWins:2};
 assert.ok(comparator({...base,name:'Alabama'},{...base,name:'Notre Dame'})<0);
});
check('equally rated 2-0 team outranks 1-1 team with stronger opponents',()=>{
 const fixtures=[
  game(1,'Zulu','FCS A',10,0,'fcs'),game(2,'Zulu','FCS B',10,0,'fcs'),
  game(1,'Alpha','X',10,0),game(2,'Y','Alpha',10,0),
  game(2,'X','FCS C',10,0,'fcs'),game(3,'X','FCS D',10,0,'fcs'),
  game(1,'Y','FCS E',10,0,'fcs')
 ];
 const result=build(fixtures,2,new Set(['Zulu','Alpha']));
 const undefeated=result.find(t=>t.name==='Zulu'),split=result.find(t=>t.name==='Alpha');
 assert.equal(undefeated.wins,2);assert.equal(undefeated.losses,0);
 assert.equal(split.wins,1);assert.equal(split.losses,1);
 assert.equal(undefeated.rating,5);assert.equal(split.rating,5);
 assert.ok(split.opponentWinPct>undefeated.opponentWinPct);
 assert.ok(split.bestOpponentWins>undefeated.bestOpponentWins);
 assert.deepEqual(Array.from(result,t=>t.name),['Zulu','Alpha']);
});
check('shuffled input has identical final order',()=>{assert.deepEqual(Array.from(build([...games].reverse(),2,new Set(names)),t=>t.name),Array.from(rankings,t=>t.name))});
const original=harness(games,names,undefined,old);
check('completed records and full-record strength metrics remain unchanged',()=>{for(const t of original.ctx.buildPollZeroRankings(games,2,new Set(names))){const updated=rankings.find(r=>r.name===t.name);for(const key of ['wins','losses','gamesPlayed','teamWinPct','opponentWinPct','bestOpponentWins'])assert.equal(updated[key],t[key])}});
const hist=games.filter(g=>g.week<=2).map(g=>({...g,startDate:g.startDate.replace('2026','2025')}));
const hh=harness(hist,names);await new Promise(r=>setImmediate(r));hh.elements.year.value='2025';hh.elements['week-select'].value='2';let histWeeks=[];const hb=hh.ctx.buildPollZeroRankings;hh.ctx.buildPollZeroRankings=(gs,...rest)=>{histWeeks=gs.map(g=>g.week);return hb(gs,...rest)};await hh.ctx.loadRankings();
check('2025 Week 2: no remap; downstream scoring is year-independent',()=>{assert.equal(Math.max(...histWeeks),2);const dated2026=build(games.filter(g=>g.week<=2),2,new Set(names));const after=hb(hist,2,new Set(names));for(const t of dated2026)assert.equal(after.find(a=>a.name===t.name).rating,t.rating)});
console.log('TOTAL',checks,'checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
