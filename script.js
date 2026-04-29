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
async function fetchTeams() {
  const response = await fetch("https://api.collegefootballdata.com/teams/fbs", {
    headers: {
      Authorization: `Bearer ${API_KEY}`
    }
  });

  const data = await response.json();
  console.log(data);

  return data;
}


async function loadRankings() {
  const teams = await fetchTeams();

  const list = document.getElementById("rankings");
  list.innerHTML = "";

  teams.slice(0, 10).forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${team.school}`;
    list.appendChild(li);
  });
}



