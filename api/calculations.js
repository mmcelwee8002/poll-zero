

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
      
  // Track score contributors so users can see why a team has its rating.
  
      if (!teams[homeTeam]) {
        teams[homeTeam] = { name: homeTeam, wins: 0, losses: 0, score: 0, breakdown: [] };
      }
  
      if (!teams[awayTeam]) {
        teams[awayTeam] = { name: awayTeam, wins: 0, losses: 0, score: 0, breakdown: [] };
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
    // Home team won.
    // Winner earns +5 for each win the opponent has.
    const homeContribution = awayWins * 5;
  
    // Loser loses -5 for each loss the winning team has.
    const awayContribution = homeLosses * -5;
  
    home.score += homeContribution;
    away.score += awayContribution;
  
    // Save breakdown details for hover/click explanation.
    home.breakdown.push({
      opponent: away.name,
      result: "Win",
      points: homeContribution
    });
  
    away.breakdown.push({
      opponent: home.name,
      result: "Loss",
      points: awayContribution
    });
  
    
  } else {
    // Away team won.
    // Winner earns +5 for each win the opponent has.
    const awayContribution = homeWins * 5;
  
    // Loser loses -5 for each loss the winning team has.
    const homeContribution = awayLosses * -5;
  
    away.score += awayContribution;
    home.score += homeContribution;
  
    // Save breakdown details for hover/click explanation.
    away.breakdown.push({
      opponent: home.name,
      result: "Win",
      points: awayContribution
    });
  
    home.breakdown.push({
      opponent: away.name,
      result: "Loss",
      points: homeContribution
    });
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

export default async function handler(req, res) {
    const { year, week } = req.query;
  
    if (!year) {
      return res.status(400).json({
        message: "Year is required"
      });
    }
  
    let url =
      `https://api.collegefootballdata.com/games` +
      `?year=${year}` +
      `&seasonType=regular` +
      `&classification=fbs`;
  

  
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.CFBD_API_KEY}`
        }
      });
  
      if (!response.ok) {
        return res.status(response.status).json({
          message: "Unable to retrieve game data"
        });
      }
  
      const games = await response.json();

      const selectedWeek = week || "all";
      
      const filteredGames =
        selectedWeek === "all"
          ? games
          : games.filter(
              (game) => game.week <= Number(selectedWeek)
            );
      
      const rankings = buildPollZeroRankings(
        filteredGames,
        selectedWeek
      );
      
      return res.status(200).json({
        year,
        week: selectedWeek,
        gameCount: filteredGames.length,
        rankings
      });


    } catch (error) {
      console.error("Calculation endpoint error:", error);
  
      return res.status(500).json({
        message: "Calculation endpoint failed"
      });
    }
  }