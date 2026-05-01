
const SEASON_YEAR = 2025;

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

// 2. NEW API function )
async function fetchGames(year) {
  const response = await fetch(
      `https://api.collegefootballdata.com/games?year=${year}&seasonType=regular&classification=fbs`,
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    }
  );

  const data = await response.json();
  console.log("First game:", data[0]);
  console.log(data);

  return data;
}

function isNonFBS(classification) {
  return classification && classification.toLowerCase() !== "fbs";
}

function buildPollZeroRankings(games, selectedWeek) {
  const teams = {};

  games.forEach(game => {
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
  home.score += 5 + awayWins;
  away.score += -5 - homeLosses;
} else {
  away.score += 5 + homeWins;
  home.score += -5 - awayLosses;
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
  team.avgScore = gamesPlayed > 0 ? team.score / gamesPlayed : 0;
});

// sort by average instead of total
return teamList.sort((a, b) => b.avgScore - a.avgScore);
}

function getRankMap(rankings) {
  const rankMap = {};

  rankings.forEach((team, index) => {
    rankMap[team.name] = index + 1;
  });

  return rankMap;
}

async function fetchTeamLogos() {
  const response = await fetch(
    "https://api.collegefootballdata.com/teams/fbs",
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    }
  );

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

  let games = await fetchGames(selectedYear);

  let previousRankMap = {};

if (selectedWeek !== "all" && Number(selectedWeek) > 1) {
  const prevWeek = Number(selectedWeek) - 1;

  const prevGames = games.filter(game => game.week <= prevWeek);
  const prevRankings = buildPollZeroRankings(prevGames);

  previousRankMap = getRankMap(prevRankings);
}


if (selectedWeek !== "all") {
  games = games.filter(game => game.week <= Number(selectedWeek));
}
  const rankings = buildPollZeroRankings(games);
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

if (currentRank <= 5) {
  li.classList.add("top-five");
} else if (currentRank <= 10) {
  li.classList.add("top-ten");
}

const logo = logoMap[team.name]
  ? `<img src="${logoMap[team.name]}" class="team-logo" />`
  : "";

li.innerHTML = `${currentRank}. ${logo} ${team.name} ${movement} — ${team.score} points (${team.wins}-${team.losses})`;
  list.appendChild(li);
  });
}



