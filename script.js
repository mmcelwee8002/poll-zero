
console.log("API KEY:", API_KEY);

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
async function fetchGames() {
  const response = await fetch(
    "https://api.collegefootballdata.com/games?year=2025&seasonType=regular&classification=fbs",
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


async function loadRankings() {
  const games = await fetchGames();

  const list = document.getElementById("rankings");
  list.innerHTML = "";

  games.slice(0, 10).forEach((game, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${game.awayTeam} at ${game.homeTeam} — ${game.awayPoints ?? "?"} - ${game.homePoints ?? "?"}`;
    list.appendChild(li);
  });
}



