function loadRankings() {
  const rankings = [
    { team: "Georgia", score: 98 },
    { team: "Michigan", score: 95 },
    { team: "Texas", score: 92 }
  ];

  const list = document.getElementById("rankings");
  list.innerHTML = "";

  rankings.forEach((team, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${team.team} - ${team.score}`;
    list.appendChild(li);
  });
}