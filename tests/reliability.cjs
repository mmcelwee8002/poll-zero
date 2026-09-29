const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { game } = require("./cumulative-scoring.cjs");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
const ap = { poll: "AP Top 25", ranks: [{ school: "Virginia", rank: 3 }] };
const cfp = { poll: "Playoff Committee Rankings", ranks: [{ school: "Virginia", rank: 7 }] };
const response = data => ({ ok: true, status: 200, json: async () => data });
function element() {
  return { value: "", options: [], children: [], classList: { add() {} }, addEventListener() {},
    appendChild(child) { this.children.push(child); if (child.tag === "option") {
      this.options.push(child); if (!this.value) this.value = child.value;
    }},
    set innerHTML(value) { this.html = value; this.children = []; },
    get innerHTML() { return this.html || ""; }
  };
}
function harness({ now = "2026-11-20T12:00:00Z", hook } = {}) {
  const elements = { year: element(), "week-select": element(), rankings: element() };
  elements["week-select"].options = ["all", ...Array.from({ length: 16 }, (_, i) => String(i))]
    .map(value => ({ value, disabled: false }));
  elements["week-select"].value = "all";
  const fixtures = [
    game(1,"Virginia","NC State",34,8,{week:1,startDate:"2026-08-29T19:30:00Z"}),
    game(2,"NC State","FCS",73,0,{week:2,startDate:"2026-09-11T23:00:00Z",awayClassification:"fcs"}),
    game(3,"Virginia","Norfolk State",59,3,{week:2,startDate:"2026-09-11T23:00:00Z",awayClassification:"fcs"}),
    game(4,"Notre Dame","Wisconsin",41,13,{week:1,startDate:"2026-09-06T23:30:00Z"}),
    game(5,"Rice","FCS",31,3,{week:1,startDate:"2026-09-05T23:00:00Z",awayClassification:"fcs"}),
    game(6,"Notre Dame","Rice",52,0,{week:2,startDate:"2026-09-12T19:30:00Z"})
  ];
  const state = { fixtures, official: [{ polls: [ap] }], hook, requests: [],
    members: { 2025: ["Virginia","Notre Dame","Wisconsin","Rice","NC State","Alabama","Ohio State","USC"],
      2026: ["Virginia","Notre Dame","Wisconsin","Rice","NC State","Alabama","Ohio State","USC","North Dakota State","Sacramento State"] } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); } }
  const ctx = { Date: Clock, console: { log() {}, error() {} },
    document: { getElementById: id => elements[id] ??= element(),
      createElement: tag => ({ ...element(), tag }), addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }), addEventListener() {} },
    fetch: async url => {
      state.requests.push(url);
      if (state.hook) { const result = await state.hook(url); if (result !== undefined) return result; }
      if (url.startsWith("/api/games")) return response(state.fixtures);
      if (url.startsWith("/api/teams")) {
        const year = new URL(url, "https://local").searchParams.get("year") || "2026";
        return response(state.members[year].map(school => ({ school })));
      }
      return response(state.official);
    }
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { ctx, state, elements,
    async load(week, year = "2026") { elements.year.value = year;
      elements["week-select"].value = String(week); await ctx.loadRankings(); },
    html() { return elements.rankings.innerHTML + elements.rankings.children.map(c => c.innerHTML).join(""); }
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
function snapshot(h) { return JSON.stringify({ html:h.html(), title:h.elements["page-title"]?.textContent,
  options:h.elements["week-select"].options }); }
async function endpoint(file, query, fetch) {
  const ctx = { fetch, URL, process: { env: { CFBD_API_KEY: "test-only-key" } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,"api",file),"utf8").replace("export default async function handler","async function handler"),ctx);
  const result = { headers: {} };
  await ctx.handler({ query }, { setHeader(name, value) { result.headers[name] = value; }, status(n) { result.status=n; return this; }, json(data) { result.data=data; return this; } });
  return result;
}
async function main() {
  let count=0;
  const check=async(name,fn)=>{ await fn(); count++; console.log("PASS",name); };
  for (const phase of ["games","membership","polls","logos"]) {
    for (const fails of [false,true]) await check("stale "+phase+" "+(fails?"failure":"success")+" cannot overwrite newer week",async()=>{
      const h=harness(); await tick(); const reached=deferred(), gate=deferred(); let blocked=false;
      h.state.hook=async url=>{
        const match=phase==="games"?url.startsWith("/api/games"):phase==="membership"?url.startsWith("/api/teams?"):
          phase==="polls"?url.startsWith("/api/rankings"):url==="/api/teams";
        if(match&&!blocked){blocked=true;reached.resolve();await gate.promise;}
      };
      const older=h.load(2); await reached.promise;
      const newer=h.load(3);
      // Same-season membership is shared: release it before awaiting either load.
      if (phase === "membership") {
        await tick();
        if(fails)gate.reject(Error("shared request failed"));else gate.resolve();
      }
      await newer;
      if (phase === "membership") {
        if (fails) assert.match(h.html(), /Unable to load rankings/);
        else assert.doesNotMatch(h.html(), /Unable to load rankings|Poll Zero Preview/);
      }
      const expected=snapshot(h);
      if(fails)gate.reject(Error("old request failed"));else gate.resolve();
      await older; assert.equal(snapshot(h),expected); assert.doesNotMatch(h.html(),/Poll Zero Preview/);
    });
  }
  await check("year change without another load invalidates a pending result",async()=>{
    const h=harness();await tick();const gate=deferred(),reached=deferred();
    h.state.hook=async url=>{if(url.startsWith("/api/games")){reached.resolve();await gate.promise;}};
    const pending=h.load(2);await reached.promise;h.elements.year.value="2025";const expected=snapshot(h);
    gate.resolve();await pending;assert.equal(snapshot(h),expected);
  });
  await check("load IDs distinguish repeated requests for the same selection",async()=>{
    const h=harness();await tick();const gate=deferred(),reached=deferred();let first=true;
    h.state.hook=async url=>{if(first&&url.startsWith("/api/rankings")){first=false;reached.resolve();await gate.promise;return response([])}};
    const pending=h.load(2);await reached.promise;await h.load(2);const expected=snapshot(h);
    gate.resolve();await pending;assert.equal(snapshot(h),expected);assert.match(h.html(),/AP #3/);
  });
  await check("initial schedule response cannot update options after a user load",async()=>{
    const gate=deferred();let first=true;
    const h=harness({hook:async url=>{if(first&&url.startsWith("/api/games")){first=false;await gate.promise;}}});
    await h.load(2);let calls=0;h.ctx.updateWeekAvailability=()=>{calls++};
    gate.resolve();await tick();assert.equal(calls,0);
  });
  const failures=[
    ["network",()=>{throw Error("offline")}],
    ["HTTP failure",()=>({ok:false,status:503,json:async()=>({secret:"must not use"})})],
    ["JSON failure",()=>({ok:true,json:async()=>{throw Error("bad json")}})],
    ...[null,{},[],[{}],[{polls:{}}],[{polls:[null]}],
      [{polls:[{poll:"AP Top 25",ranks:{}}]}],
      [{polls:[{poll:"AP Top 25",ranks:[null,{school:"Virginia",rank:"3"}]}]}]]
      .map((data,i)=>["malformed/empty "+i,()=>response(data)])
  ];
  for(const [name,fail] of failures) for(const week of [1,2,3]) await check("Week "+week+" handles "+name,async()=>{
    const h=harness();await tick();h.state.hook=async url=>url.startsWith("/api/rankings")?fail():undefined;
    let builds=0;const build=h.ctx.buildPollZeroRankings;h.ctx.buildPollZeroRankings=(...a)=>{builds++;return build(...a)};
    await h.load(week);
    if(week===1){assert.match(h.html(),/AP Top 25 rankings are unavailable/);assert.equal(builds,0);}
    else{if(week===2)assert.match(h.html(),/Poll Zero Preview/);assert.match(h.html(),/Virginia/);assert.equal(builds,week===2?1:2);}
  });
  for(const [name,week,polls,expected] of [
    ["AP-only",2,[ap],"AP Top 25"],["first CFP before old threshold",8,[ap,cfp],"Playoff Committee Rankings"],
    ["later CFP",12,[cfp,ap],"Playoff Committee Rankings"],["late AP fallback",12,[ap],"AP Top 25"],
    ["empty CFP falls back",12,[{poll:cfp.poll,ranks:[]},ap],"AP Top 25"],
    ["neither",12,[],null],["Week 1 remains AP",1,[cfp,ap],"AP Top 25"],
    ["Week 1 CFP-only unavailable",1,[cfp],null]
  ]) await check(name,async()=>{
    const h=harness();await tick();h.state.official=[{polls}];
    assert.equal(h.ctx.getPollNameForWeek(week,h.state.official),expected);
    const map=h.ctx.buildOfficialRankMap(h.state.official,week);
    assert.equal(map.Virginia,expected==="AP Top 25"?3:expected?7:undefined);
  });
  await check("CFP label and poll-independent score/order",async()=>{
    const h=harness();await tick();await h.load(2);
    const before=h.ctx.buildPollZeroRankings(h.state.fixtures,2,new Set(h.state.members[2026]));
    h.state.official=[{polls:[cfp,ap]}];await h.load(2);assert.match(h.html(),/CFP #7/);
    const after=h.ctx.buildPollZeroRankings(h.state.fixtures,2,new Set(h.state.members[2026]));
    assert.equal(JSON.stringify(after),JSON.stringify(before));
  });
  await check("season-aware frontend membership requests",async()=>{
    const h=harness();await tick();
    const y25=await h.ctx.fetchFBSTeamNames("2025"),y26=await h.ctx.fetchFBSTeamNames("2026");
    assert.ok(!y25.has("Sacramento State"));assert.ok(y26.has("North Dakota State"));assert.ok(!y26.has("North Dakota"));
    for(const n of ["Alabama","Notre Dame","Ohio State","Virginia","USC"])assert.ok(y25.has(n)&&y26.has(n));
    await h.load(2,"2025");assert.ok(h.state.requests.includes("/api/teams?year=2025"));
  });
  await check("live CFBD membership fixtures preserve season eligibility",async()=>{
    const h=harness();await tick();
    const members={};
    for(const year of [2025,2026]) {
      const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures",`fbs-${year}.json`),"utf8"));
      h.state.hook=async url=>url===`/api/teams?year=${year}`?response(fixture):undefined;
      members[year]=await h.ctx.fetchFBSTeamNames(year);
      for(const school of ["Alabama","Notre Dame","Ohio State","Virginia","USC"])assert.ok(members[year].has(school));
    }
    assert.ok(members[2026].has("North Dakota State"));
    assert.ok(!members[2026].has("North Dakota"));
    assert.ok(!members[2025].has("Sacramento State"));
    const games=["North Dakota State","North Dakota","Sacramento State"].flatMap((school,i)=>[
      game(i*2+1,school,"FCS A",20,0,{awayClassification:"fcs"}),
      game(i*2+2,school,"FCS B",20,0,{awayClassification:"fcs"})
    ]);
    assert.deepEqual(Array.from(h.ctx.buildPollZeroRankings(games,2,members[2026]),t=>t.name),["North Dakota State","Sacramento State"]);
    assert.equal(h.ctx.buildPollZeroRankings(games,2,members[2025]).length,0);
  });
  for(const [year,weeks] of [[2014,[9,10,11]],[2025,[10,11,12]]]) {
    for(const [index,week] of weeks.entries()) await check(`historical ${year} Week ${week} comparison renders`,async()=>{
      const h=harness();await tick();
      const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,"fixtures",`polls-${year}.json`),"utf8"));
      h.state.official=fixture.filter(w=>w.week===week);
      h.state.members[year]=h.state.members[2025];
      h.state.fixtures=Array.from({length:6},(_,i)=>game(i+1,"Notre Dame",`FCS ${i}`,20,0,{
        week:i===5?week:i+1,startDate:`${year}-09-${String(i+1).padStart(2,"0")}T18:00:00Z`,awayClassification:"fcs"
      }));
      const expected=index===0?"AP Top 25":"Playoff Committee Rankings";
      assert.equal(h.ctx.getPollNameForWeek(week,h.state.official),expected);
      await h.load(week,String(year));
      assert.match(h.html(),/Notre Dame/);
      assert.match(h.html(),index===0?/AP #/:/CFP #/);
      assert.doesNotMatch(h.html(),/Unable to load/);
    });
  }
  await check("teams endpoint forwards requested season and protects authentication",async()=>{
    for(const year of ["2025","2026"]){
      const out=await endpoint("teams.js",{year},async(url,options)=>{
        assert.equal(new URL(url).searchParams.get("year"),year);
        assert.equal(options.headers.Authorization,"Bearer test-only-key");
        return response([{school:year==="2025"?"Virginia":"North Dakota State"}]);
      });assert.equal(out.status,200);
    }
    const bad=await endpoint("teams.js",{year:"bad"},()=>{throw Error("must not fetch")});assert.equal(bad.status,400);
  });
  for(const file of ["rankings.js","teams.js"]) await check(file+" preserves upstream errors and catches network failure",async()=>{
    const query={year:"2026",week:"2"};
    const upstream=await endpoint(file,query,async()=>({ok:false,status:429,json:async()=>({key:"sensitive"})}));
    assert.equal(upstream.status,429);assert.ok(!JSON.stringify(upstream.data).includes("sensitive"));
    const network=await endpoint(file,query,async()=>{throw Error("sensitive")});
    assert.equal(network.status,502);assert.ok(!JSON.stringify(network.data).includes("sensitive"));
  });
  await check("protected Notre Dame, Virginia, FCS and cutoff snapshot",async()=>{
    const h=harness();await tick();const names=new Set(h.state.members[2026]);
    const rows=h.ctx.buildPollZeroRankings(h.state.fixtures,2,names);
    const nd=rows.find(t=>t.name==="Notre Dame"),va=rows.find(t=>t.name==="Virginia");
    assert.equal(nd.rating,2.5);assert.deepEqual(Array.from(nd.breakdown,b=>b.points),[0,5]);
    assert.equal(va.breakdown.find(b=>b.opponent==="NC State").points,5);
    assert.equal(va.breakdown.find(b=>b.opponent==="Norfolk State").points,5);
    const future=game(7,"Rice","X",20,0,{startDate:"2026-09-19T12:00:00Z"});
    const window=[...h.state.fixtures,future].filter(g=>h.ctx.getPollZeroWeek(g,2026)<=2);
    assert.equal(h.ctx.buildPollZeroRankings(window,2,names).find(t=>t.name==="Notre Dame").rating,2.5);
  });
  console.log("TOTAL",count,"reliability checks passed");
}
module.exports={harness,endpoint};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
