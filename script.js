
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
  console.log(data);

  return data;
}

function isNonFBS(classification) {
  return classification && classification.toLowerCase() !== "fbs";
}

function buildPollZeroRankings(games) {
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

  return Object.values(teams).sort((a, b) => b.score - a.score);
}

async function loadRankings() {

const selectedYear = document.getElementById("year-select").value;

document.getElementById("page-title").textContent =
`🏈 Poll Zero Rankings — ${selectedYear}`;

  const games = await fetchGames(selectedYear);
  const rankings = buildPollZeroRankings(games);

  const list = document.getElementById("rankings");
  list.innerHTML = "";

  rankings.slice(0, 25).forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${team.name} — ${team.score} points (${team.wins}-${team.losses})`;
    list.appendChild(li);
  });
}



