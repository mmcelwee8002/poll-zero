const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadEngines() {
  const root = path.resolve(__dirname, "..");
  const frontend = { document: {
    getElementById: () => ({ appendChild() {} }),
    createElement: () => ({})
  }};
  vm.createContext(frontend);
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  vm.runInContext(script.slice(0, script.indexOf("const supportsHover")), frontend);
  const backend = {};
  vm.createContext(backend);
  const api = fs.readFileSync(path.join(root, "api/calculations.js"), "utf8");
  vm.runInContext(api.slice(0, api.indexOf("export default")), backend);
  return { frontend, backend };
}

function game(day, homeTeam, awayTeam, homePoints = 20, awayPoints = 10, extra = {}) {
  return { id: day + homeTeam + awayTeam, week: 1, startDate:
    "2025-09-" + String(day).padStart(2, "0") + "T18:00:00Z",
    completed: true, homeTeam, awayTeam, homePoints, awayPoints,
    homeClassification: "fbs", awayClassification: "fbs", ...extra };
}

// Independent audit oracle: ordered pair enumeration, with no production helpers.
function oracle(games, name) {
  const finished = games.filter(g => g.completed === true &&
    Number.isFinite(g.homePoints) && Number.isFinite(g.awayPoints) &&
    g.homePoints !== g.awayPoints && typeof g.startDate === "string" &&
    Number.isFinite(Date.parse(g.startDate)));
  return finished.filter(g => g.homeTeam === name || g.awayTeam === name).map(match => {
    const home = match.homeTeam === name;
    const opponent = home ? match.awayTeam : match.homeTeam;
    const classification = home ? match.awayClassification : match.homeClassification;
    const won = home ? match.homePoints > match.awayPoints : match.awayPoints > match.homePoints;
    const downstream = finished.filter(next =>
      Date.parse(next.startDate) > Date.parse(match.startDate) &&
      (next.homeTeam === opponent || next.awayTeam === opponent));
    const wins = downstream.filter(next => next.homeTeam === opponent
      ? next.homePoints > next.awayPoints : next.awayPoints > next.homePoints).length;
    const losses = downstream.length - wins;
    const nonFBS = classification && classification.toLowerCase() !== "fbs";
    return { opponent, matchup: match, downstream,
      wins: nonFBS ? 1 : wins, losses: nonFBS ? 11 : losses,
      points: won ? 5 * (nonFBS ? 1 : wins) : -5 * (nonFBS ? 11 : losses) };
  });
}

function main() {
  const engines = loadEngines();
  let count = 0;
  for (const [label, engine] of Object.entries(engines)) {
    const rank = gs => engine.buildPollZeroRankings(gs, 1,
      new Set(gs.flatMap(g => [[g.homeTeam,g.homeClassification],[g.awayTeam,g.awayClassification]])
        .filter(([,c]) => c === "fbs").map(([n]) => n)));
    const points = (gs, name, opponent) => rank(gs).find(t => t.name === name)
      .breakdown.find(b => b.opponent === opponent).points;
    const check = (name, fn) => { fn(); count++; console.log("PASS", label, name); };
    const rice = [game(1,"Rice","X"),game(8,"Notre Dame","Rice"),
      game(15,"Rice","Y"),game(22,"Rice","Z")];
    check("1: previous wins give zero", () => assert.equal(points(rice.slice(0,2),"Notre Dame","Rice"),0));
    check("2: one subsequent win gives +5", () => assert.equal(points(rice.slice(0,3),"Notre Dame","Rice"),5));
    check("3: two subsequent wins give +10", () => assert.equal(points(rice,"Notre Dame","Rice"),10));
    const losses = [game(1,"X","B"),game(2,"Y","B"),game(3,"B","A"),game(4,"Z","B")];
    check("4: previous losses give zero", () => assert.ok(points(losses.slice(0,3),"A","B") === 0));
    check("5: subsequent loss gives -5", () => assert.equal(points(losses,"A","B"),-5));
    const distinct = [game(1,"A","Opponent"),game(2,"Opponent","X"),
      game(3,"C","Opponent"),game(4,"Opponent","Y")];
    check("6: each matchup has its own downstream starting point", () => {
      assert.equal(points(distinct,"A","Opponent"),10);
      assert.equal(points(distinct,"C","Opponent"),5);
    });
    check("7: matchup itself excluded in both directions", () => {
      const only=[game(1,"A","B")];
      assert.equal(points(only,"A","B"),0);
      assert.ok(points(only,"B","A") === 0);
      assert.equal(engine.getDownstreamRecord(only,"B",only[0]).losses,0);
    });
    check("8: FCS fixed +5 / -55, excluded from rankings", () => {
      const gs=[game(1,"A","FCS",20,10,{awayClassification:"fcs"}),
        game(2,"B","FCS",10,20,{awayClassification:"fcs"})];
      assert.equal(points(gs,"A","FCS"),5); assert.equal(points(gs,"B","FCS"),-55);
      assert.ok(!rank(gs).some(t => t.name === "FCS"));
    });
    check("incomplete, missing scores, ties and invalid dates cannot count", () => {
      const bad=[{completed:false},{homePoints:null},{awayPoints:undefined},
        {homePoints:10,awayPoints:10},{startDate:null},{startDate:"invalid"}];
      for(const extra of bad) {
        const gs=[...rice.slice(0,2),game(9,"Rice","Invalid",20,10,extra)];
        assert.equal(points(gs,"Notre Dame","Rice"),0);
        assert.ok(!rank(gs).some(t => t.name === "Invalid"));
      }
    });
    check("same API week uses strict kickoff ordering, including timezone offsets", () => {
      const gs=[game(1,"A","B",20,10,{startDate:"2025-09-01T18:00:00Z"}),
        game(1,"B","X",20,10,{startDate:"2025-09-01T13:00:00-05:00"}),
        game(1,"B","Y",20,10,{startDate:"2025-09-01T19:00:00Z"})];
      assert.equal(points(gs,"A","B"),5);
    });
    check("array order does not change scores; oracle matches every contribution", () => {
      const gs=[...distinct,...losses.map(g=>({...g,homeTeam:"L"+g.homeTeam,awayTeam:"L"+g.awayTeam}))];
      const before=rank(gs), after=rank([...gs].reverse());
      for(const team of before) {
        assert.equal(team.score,oracle(gs,team.name).reduce((n,r)=>n+r.points,0));
        assert.equal(after.find(t=>t.name===team.name).score,team.score);
      }
    });
    check("selected input window cannot see later excluded outcomes", () => {
      assert.equal(points(rice.slice(0,2),"Notre Dame","Rice"),0);
      assert.equal(points(rice,"Notre Dame","Rice"),10);
      if(label==="backend") {
        const rows=rank(rice.map((g,i)=>({...g,week:i<2?1:2})));
        assert.equal(rows.find(t=>t.name==="Notre Dame").score,0);
      }
    });
  }
  console.log("TOTAL",count,"downstream checks passed");
}
module.exports = { loadEngines, game, oracle };
if (require.main === module) main();
