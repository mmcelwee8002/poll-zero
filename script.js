
const SEASON_YEAR = 2025;
function getMinimumGames(week) {
  if (week <= 1) return 1;
  if (week <= 3) return 2;
  if (week <= 6) return 3;
  if (week <= 9) return 5;
  return 6;
}

function calculateTeamScore(games) {
  let total = 0;

  games.forEach(game => {
    let opponentWins = game.opponentWins;
    let opponentLosses = game.opponentLosses;

    if (game.nonFBS) {
      opponentWins = 1;
      opponentLosses = 11;
    }

    if (game.result === "win") {
      total += 5 + opponentWins;
    }

    if (game.result === "loss") {
      total += -5 - opponentLosses;
    }
  });

  return total;
}



async function fetchGames(year) {
  const response = await fetch(`/api/games?year=${year}`);

  const data = await response.json();
  return data;
}

// Gets AP / CFP rankings from our Vercel backend.
// Weeks 1-10 will use AP. Weeks 11+ will use CFP later.
async function fetchOfficialRankings(year, week) {
  const response = await fetch(`/api/rankings?year=${year}&week=${week}`);
  const data = await response.json();

  console.log("Official rankings:", data);

  return data;
}


function isNonFBS(classification) {
  return classification && classification.toLowerCase() !== "fbs";
}

function buildPollZeroRankings(games, selectedWeek) {
  const teams = {};

  games.forEach(game => {
if (selectedWeek !== "all" && game.week > Number(selectedWeek)) {
  return;
}


    const homeTeam = game.homeTeam;
    const awayTeam = game.awayTeam;
    const homePoints = game.homePoints;
    const awayPoints = game.awayPoints;

    // Skip games that do not have scores yet
    if (homePoints === null || awayPoints === null) {
      return;
    }

    if (!teams[homeTeam]) {
      teams[homeTeam] = { name: homeTeam, wins: 0, losses: 0, score: 0 };
    }

    if (!teams[awayTeam]) {
      teams[awayTeam] = { name: awayTeam, wins: 0, losses: 0, score: 0 };
    }

    if (homePoints > awayPoints) {
      teams[homeTeam].wins += 1;
      teams[awayTeam].losses += 1;
    } else {
      teams[awayTeam].wins += 1;
      teams[homeTeam].losses += 1;
    }
  });

  games.forEach(game => {
    const homeTeam = game.homeTeam;
    const awayTeam = game.awayTeam;
    const homePoints = game.homePoints;
    const awayPoints = game.awayPoints;

    if (homePoints === null || awayPoints === null) {
      return;
    }

    const home = teams[homeTeam];
    const away = teams[awayTeam];

const homeIsNonFBS = isNonFBS(game.homeClassification);
const awayIsNonFBS = isNonFBS(game.awayClassification);

const homeWins = homeIsNonFBS ? 1 : home.wins;
const homeLosses = homeIsNonFBS ? 11 : home.losses;

const awayWins = awayIsNonFBS ? 1 : away.wins;
const awayLosses = awayIsNonFBS ? 11 : away.losses;

if (homePoints > awayPoints) {
  home.score += awayWins * 5;
  away.score += homeLosses * -5;
} else {
  away.score += homeWins * 5;
  home.score += awayLosses * -5;
}
  });

 const teamList = Object.values(teams).filter(team => {
  const teamGames = games.filter(game =>
    game.homeTeam === team.name || game.awayTeam === team.name
  );

  return teamGames.some(game =>
    (game.homeTeam === team.name && game.homeClassification === "fbs") ||
    (game.awayTeam === team.name && game.awayClassification === "fbs")
  );
});



// calculate average score per game
teamList.forEach(team => {
  const gamesPlayed = team.wins + team.losses;
  team.gamesPlayed = gamesPlayed;
  team.avgScore = gamesPlayed > 0 ? team.score / gamesPlayed : 0;
});

// sort by average instead of total
const minimumGames = getMinimumGames(selectedWeek);

const eligibleTeams = teamList.filter(
  (team) => team.gamesPlayed >= minimumGames
);

eligibleTeams.forEach(team => {
  team.rating = team.avgScore;
});

return eligibleTeams.sort((a, b) => b.avgScore - a.avgScore);

}
function getRankMap(rankings) {
  const rankMap = {};

  rankings.forEach((team, index) => {
    rankMap[team.name] = index + 1;
  });

  return rankMap;
}

// async function fetchTeamLogos() {
async function fetchTeamLogos() {
  const response = await fetch("/api/teams");

  const data = await response.json();

 
  const logoMap = {};

  data.forEach(team => {
    if (team.logos && team.logos.length > 0) {
      logoMap[team.school] = team.logos[0];
    }
  });

  return logoMap;
}

async function loadRankings() {

const selectedYear = document.getElementById("year-select").value;
const selectedWeek = document.getElementById("week-select").value;

document.getElementById("page-title").textContent =
`🏈 Poll Zero Rankings — ${selectedYear} — ${selectedWeek === "all" ? "All Weeks" : `Week ${selectedWeek}`}`;

 const weekParam = selectedWeek === "all" ? "" : selectedWeek;

let games = await fetchGames(selectedYear);

// Get AP / CFP rankings for the selected week.
// This lets us compare Poll Zero against human / committee rankings.
let officialRankings = [];

if (selectedWeek !== "all") {
  officialRankings = await fetchOfficialRankings(selectedYear, selectedWeek);
}


  let previousRankMap = {};

if (selectedWeek !== "all" && Number(selectedWeek) > 1) {
  const prevWeek = Number(selectedWeek) - 1;

  const prevGames = games.filter(game => game.week <= prevWeek);
  const prevRankings = buildPollZeroRankings(prevGames, prevWeek);

  previousRankMap = getRankMap(prevRankings);
}


if (selectedWeek !== "all") {
  games = games.filter(game => game.week <= Number(selectedWeek));
}
  const rankings = buildPollZeroRankings(games, selectedWeek);
  const logoMap = await fetchTeamLogos();
  const list = document.getElementById("rankings");

  list.innerHTML = "";

rankings.slice(0, 25).forEach((team, index) => {
const currentRank = index + 1;
const previousRank = previousRankMap[team.name];

let movement = "";

if (previousRank !== undefined) {
  const change = previousRank - currentRank;

if (change > 0) movement = `<span class="up">↑ ${change}</span>`;
if (change < 0) movement = `<span class="down">↓ ${Math.abs(change)}</span>`;
if (change === 0) movement = `<span class="same">—</span>`;

} else if (selectedWeek !== "all") {
  movement = `<span class="new">NEW</span>`;
}

const li = document.createElement("li");

// Ranking Style
if (currentRank <= 4) {
  li.classList.add("top-four");   // optional if you want to keep this
} else if (currentRank <= 12) {
  li.classList.add("top-twelve");
}

// Logo 
const logo = logoMap[team.name]
  ? `<img src="${logoMap[team.name]}" class="team-logo" />`
  : "";

// Tier Logic

  let tierClass = "";

if (team.rating >= 9) tierClass = "elite";
else if (team.rating >= 8) tierClass = "great";
else if (team.rating >= 7) tierClass = "good";
else if (team.rating >= 6) tierClass = "average";
else tierClass = "bad";
  
   li.classList.add(tierClass);

const barColor =
  team.rating >= 9 ? "#2ecc71" :
  team.rating >= 8 ? "#27ae60" :
  team.rating >= 7 ? "#f1c40f" :
  team.rating >= 6 ? "#e67e22" :
  "#e74c3c";

const barWidth = Math.min(team.rating * 10, 100);


li.innerHTML = `
  <div class="team-row">
    <span>${currentRank}. ${logo} ${team.name} ${movement}</span>
    <span class="rating-value">${team.rating.toFixed(1)}</span>
  </div>

  <div class="rating-bar">
    <div class="rating-fill" style="width: ${barWidth}%; background: ${barColor};"></div>
  </div>

  <div class="record-text">
    (${team.wins}-${team.losses})
  </div>
`;



  list.appendChild(li);});
}



window.loadRankings = loadRankings;