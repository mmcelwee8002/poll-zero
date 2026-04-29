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


function loadRankings() {
  const teams = [
    {
      name: "Team A",
      games: [
        { result: "win", opponentWins: 9, opponentLosses: 3 },
        { result: "loss", opponentWins: 10, opponentLosses: 2 },
        { result: "win", nonFBS: true }
      ]
    },
    {
      name: "Team B",
      games: [
        { result: "win", opponentWins: 6, opponentLosses: 6 },
        { result: "win", opponentWins: 7, opponentLosses: 5 }
      ]
    }
  ];

  const rankings = teams.map(team => {
    return {
      name: team.name,
      score: calculateTeamScore(team.games)
    };
  });

  rankings.sort((a, b) => b.score - a.score);

  const list = document.getElementById("rankings");
  list.innerHTML = "";

  rankings.forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${team.name} - ${team.score}`;
    list.appendChild(li);
  });
}