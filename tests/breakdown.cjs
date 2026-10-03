const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
const context = {document: {getElementById: () => ({appendChild(){}}), createElement: () => ({})}};
vm.createContext(context);
vm.runInContext(script.slice(0, script.indexOf('const supportsHover')), context);
let day = 0;
function game(homeTeam, awayTeam, fcs = false) {
 return {id: ++day, week: 1, startDate: '2025-09-01T18:00:00Z', completed: true,
 homeTeam, awayTeam, homePoints: 21, awayPoints: 7, homeClassification: 'fbs', awayClassification: fcs ? 'fcs' : 'fbs'};
}
// Controlled example, not a claim about an actual Iowa season.
const games = [game('Iowa','Michigan'), game('Iowa','Iowa State'), game('Iowa','Northern Iowa',true), game('Iowa','Northern Illinois')];
for(let i=0;i<3;i++) games.push(game('Michigan','M'+i));
for(let i=0;i<2;i++) games.push(game('Iowa State','S'+i));
for(let i=0;i<3;i++) games.push(game('N'+i,'Northern Illinois'));
for(let i=0;i<4;i++) games.push(game('Texas','T'+i));
games.push(game('Loser','Weak'),game('Michigan','Loser'),game('FCS Loser','Northern Iowa',true));
games[games.length-1].homePoints=0;
// Michigan now has four wins; remove its extra fixture win to retain 3-1.
games.splice(games.findIndex(g=>g.awayTeam==='M2'),1);
const names = new Set(games.flatMap(g => [g.homeTeam,g.awayTeam]).filter(n => n!=='Northern Iowa'));
const teams=context.buildPollZeroRankings(games,1,names);
const iowa=teams.find(t=>t.name==='Iowa');
let count=0;
function check(name,fn){fn();count++;console.log('PASS',name);}
check('Iowa: all four games retained, including winless zero contribution',()=>{
 assert.equal(iowa.breakdown.length,4);
 assert.deepEqual(Array.from(iowa.breakdown,b=>b.points),[15,10,5,0]);
 assert.match(context.renderTeamBreakdown(iowa),/class="contribution-zero">0</);
});
check('FBS current records and FCS synthetic record',()=>{
 assert.equal(iowa.breakdown[1].opponentWins,2);
 assert.equal(iowa.breakdown[3].opponentLosses,4);
 assert.equal(iowa.breakdown[2].level,'FCS');
 assert.equal(iowa.breakdown[2].opponentWins,1);
 assert.equal(iowa.breakdown[2].opponentLosses,11);
 assert.match(context.renderOpponentResult(iowa.breakdown[2]),/Poll Zero Record Used: 1-11/);
});
check('Iowa totals and rating reconcile',()=>{
 assert.equal(iowa.score,30);assert.equal(iowa.gamesPlayed,4);assert.equal(iowa.rating,7.5);
 for(const t of teams){assert.equal(t.breakdown.reduce((sum,b)=>sum+b.points,0),t.score);assert.equal(t.rating,t.score/t.gamesPlayed);}
});
check('Equal undefeated records can have different ratings',()=>{
 const texas=teams.find(t=>t.name==='Texas');assert.equal(texas.wins,iowa.wins);assert.equal(texas.losses,iowa.losses);assert.equal(texas.rating,0);
});
check('Losses display negative points, including FCS -55',()=>{
 assert.match(context.renderTeamBreakdown(teams.find(t=>t.name==='Loser')),/>-5</);
 assert.match(context.renderTeamBreakdown(teams.find(t=>t.name==='FCS Loser')),/>-55</);
});
check('Loss to undefeated team displays unsigned zero',()=>{
 const loss=teams.find(t=>t.name==='T0').breakdown[0];
 assert.ok(Object.is(loss.points,-0));
 assert.match(context.renderOpponentResult(loss),/class="contribution-zero">0</);
});
check('Opponent names are escaped and every repeated matchup renders',()=>{
 const html=context.renderTeamBreakdown({...iowa,breakdown:[...iowa.breakdown,{...iowa.breakdown[0],opponent:'<test> " &'}]});
 assert.equal((html.match(/class="opponent-result"/g)||[]).length,5);
 assert.ok(html.includes('&lt;test&gt; &quot; &amp;'));
});
check('Result and contribution classes cover wins, losses, and both zeros',()=>{
 for(const [result,points,color] of [['Win',5,'positive'],['Loss',-5,'negative'],['Loss',-0,'zero'],['Win',0,'zero']]) {
  const item={...iowa.breakdown[0],result,points};
  const html=context.renderOpponentResult(item);
  assert.ok(html.includes('class="result-'+result.toLowerCase()+'">'+result+'</span>'));
  assert.ok(html.includes('class="contribution-'+color+'">'+(points===0?'0':points>0?'+'+points:points)+'</b>'));
  assert.match(html,/class="opponent-date">Sep 1, 2025</);
  assert.doesNotMatch(html,/>[+-]0</);
  assert.ok(Object.is(item.points,points));
 }
});
check('All contribution branches retain the original game date, including FCS',()=>{
 for(const team of teams) for(const item of team.breakdown) assert.equal(item.startDate,'2025-09-01T18:00:00Z');
 const html=context.renderOpponentResult(iowa.breakdown[2]);
 assert.match(html,/class="opponent-date">Sep 1, 2025</);
 assert.match(html,/FCS<\/span>/);
 assert.match(html,/Poll Zero Record Used: 1-11/);
 assert.match(html,/class="contribution-positive">\+5</);
});
check('Dates use the Central calendar, preserve date-only input, and omit unknown dates',()=>{
 assert.equal(context.formatOpponentGameDate('2026-09-20T02:30:00Z'),'Sep 19, 2026');
 assert.equal(context.formatOpponentGameDate('2026-09-19'),'Sep 19, 2026');
 assert.equal(context.formatOpponentGameDate('2026-01-01T02:00:00Z'),'Dec 31, 2025');
 for(const startDate of [undefined,null,'','invalid']) {
  assert.doesNotMatch(context.renderOpponentResult({...iowa.breakdown[0],startDate}),/opponent-date/);
 }
});
console.log('TOTAL',count,'breakdown checks passed');
module.exports={games,teams,iowa};
