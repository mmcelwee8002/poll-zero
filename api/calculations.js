
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
  
    if (week && week !== "all") {
      url += `&week=${week}`;
    }
  
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
  
      return res.status(200).json({
        year,
        week: week || "all",
        gameCount: games.length
      });
    } catch (error) {
      console.error("Calculation endpoint error:", error);
  
      return res.status(500).json({
        message: "Calculation endpoint failed"
      });
    }
  }