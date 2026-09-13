
const yearSelect = document.getElementById("year");
const currentYear = new Date().getFullYear();

for (let year = currentYear; year >= currentYear - 3; year--) {
  const option = document.createElement("option");

  option.value = year;
  option.textContent = year;

  yearSelect.appendChild(option);
}



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

// Use Central calendar dates so late-night UTC kickoffs stay on the football
// date. Week 0 opens Aug. 27; Week 1 starts Sept. 1, then weeks run Tue-Mon.
function get2026PollZeroCalendarWeek(timestamp) {
  const date = new Date(timestamp);
  if (timestamp == null || !Number.isFinite(date.getTime())) return NaN;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = type => Number(parts.find(item => item.type === type).value);
  const calendarDay = Date.UTC(part("year"), part("month") - 1, part("day"));
  if (calendarDay < Date.UTC(2026, 7, 27)) return -1;
  if (calendarDay < Date.UTC(2026, 8, 1)) return 0;
  return 1 + Math.floor((calendarDay - Date.UTC(2026, 8, 1)) / (7 * 24 * 60 * 60 * 1000));
}

function getPollZeroWeek(game, selectedYear) {
  if (Number(selectedYear) === 2026) {
    // CFBD can group multiple calendar windows under one numeric week.
    return get2026PollZeroCalendarWeek(game.startDate);
  }

  return game.week;
}

function getAvailablePollZeroWeek(games, selectedYear, now = Date.now()) {
  // In 2026 availability starts at the calendar boundary, even before the
  // first kickoff or completed game. Use the same calendar as game filtering.
  if (Number(selectedYear) === 2026) {
    return get2026PollZeroCalendarWeek(now);
  }

  // Preserve schedule-based availability for historical seasons.
  // A week becomes available when a game is completed or its known scheduled
  // kickoff has arrived (TBD times cannot establish a start). Use the latest
  // such API week, mapped for the selected season.
  // With no started games, -1 keeps every numbered week unavailable.
  return games.reduce((availableWeek, game) => {
    const kickoff = Date.parse(game.startDate);
    if (game.completed === true || (!game.startTimeTBD && Number.isFinite(kickoff) && kickoff <= now)) {
      return Math.max(availableWeek, getPollZeroWeek(game, selectedYear));
    }
    return availableWeek;
  }, -1);
}

function updateWeekAvailability(games, selectedYear) {
  const availableWeek = getAvailablePollZeroWeek(games, selectedYear);
  Array.from(document.getElementById("week-select").options).forEach(option => {
    option.disabled = option.value !== "all" && Number(option.value) > availableWeek;
  });
  return availableWeek;
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

  return data;
}


function isNonFBS(classification) {
  return classification && classification.toLowerCase() !== "fbs";
}

function buildPollZeroRankings(games, selectedWeek, fbsTeamNames) {
  const teams = {};

  games.forEach(game => {
    // if (selectedWeek !== "all" && game.week > Number(selectedWeek)) {
    //   return;
    // }


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
      teams[homeTeam] = { name: homeTeam, wins: 0, losses: 0, score: 0, breakdown: [], totalOpponentWins: 0, totalOpponentLosses: 0, bestOpponentWins: 0 };
    }

    if (!teams[awayTeam]) {
      teams[awayTeam] = { name: awayTeam, wins: 0, losses: 0, score: 0, breakdown: [], totalOpponentWins: 0, totalOpponentLosses: 0, bestOpponentWins: 0 };
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

    // Tiebreak strength uses each played opponent's record in this same window,
    // including the scoring model's synthetic 1-11 record for FCS opponents.
    home.totalOpponentWins += awayWins;
    home.totalOpponentLosses += awayLosses;
    home.bestOpponentWins = Math.max(home.bestOpponentWins, awayWins);
    away.totalOpponentWins += homeWins;
    away.totalOpponentLosses += homeLosses;
    away.bestOpponentWins = Math.max(away.bestOpponentWins, homeWins);

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

// Only official FBS teams can appear in Poll Zero rankings.
// FCS teams still participate in the calculations as opponents.
const teamList = Object.values(teams).filter(team =>
  fbsTeamNames.has(team.name)
);



  // calculate average score per game
  teamList.forEach(team => {
    const gamesPlayed = team.wins + team.losses;
    team.gamesPlayed = gamesPlayed;
    team.avgScore = gamesPlayed > 0 ? team.score / gamesPlayed : 0;
    const opponentGames = team.totalOpponentWins + team.totalOpponentLosses;
    team.opponentWinPct = opponentGames > 0 ? team.totalOpponentWins / opponentGames : 0;
    team.teamWinPct = gamesPlayed > 0 ? team.wins / gamesPlayed : 0;
  });

  // sort by average instead of total
  const minimumGames = getMinimumGames(selectedWeek);

  const eligibleTeams = teamList.filter(
    (team) => team.gamesPlayed >= minimumGames
  );

  eligibleTeams.forEach(team => {
    team.rating = team.avgScore;
  });

  // These criteria only break ties; they never change the Poll Zero rating.
  return eligibleTeams.sort((a, b) =>
    b.avgScore - a.avgScore ||
    b.teamWinPct - a.teamWinPct ||
    b.opponentWinPct - a.opponentWinPct ||
    b.bestOpponentWins - a.bestOpponentWins ||
    a.name.localeCompare(b.name, "en")
  );

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

// Get the official list of FBS teams.
// This is used to prevent FCS teams from appearing in Poll Zero rankings,
// even if an individual game is incorrectly labeled by the API.
async function fetchFBSTeamNames() {
  const response = await fetch("/api/teams");
  const data = await response.json();

  return new Set(data.map(team => team.school));
}

// Use AP rankings before CFP rankings exist.
// Starting Week 11, compare Poll Zero against CFP.
function getPollNameForWeek(selectedWeek) {
  return Number(selectedWeek) >= 11
    ? "Playoff Committee Rankings"
    : "AP Top 25";
}

// Builds a quick lookup table:
// Example: officialRankMap["Indiana"] = 3
function buildOfficialRankMap(officialRankings, selectedWeek) {
  const officialRankMap = {};

  // No official ranking comparison for "All Weeks"
  if (!officialRankings || officialRankings.length === 0) {
    return officialRankMap;
  }

  const pollName = getPollNameForWeek(selectedWeek);

  // CollegeFootballData returns rankings inside officialRankings[0].polls
  const polls = officialRankings[0].polls;

  const selectedPoll = polls.find(poll => poll.poll === pollName);

  // If the selected poll does not exist for that week, return empty map
  if (!selectedPoll) {
    return officialRankMap;
  }

  selectedPoll.ranks.forEach(item => {
    officialRankMap[item.school] = item.rank;
  });

  return officialRankMap;
}


async function loadRankings() {




  const selectedYear = document.getElementById("year").value;
  const selectedWeek = document.getElementById("week-select").value;

  document.getElementById("page-title").textContent =
    `🏈 Poll Zero Rankings — ${selectedYear} — ${selectedWeek === "all" ? "All Weeks" : `Week ${selectedWeek}`}`;

  const weekParam = selectedWeek === "all" ? "" : selectedWeek;

  let games = await fetchGames(selectedYear);

  const availableWeek = updateWeekAvailability(games, selectedYear);

  // Guard stale/programmatic selections as well as disabling future options.
  if (selectedWeek !== "all" && Number(selectedWeek) > availableWeek) {
    document.getElementById("rankings").innerHTML = `
      <li class="no-rankings-message">Week ${selectedWeek} has not started yet.</li>
    `;
    return;
  }

  // Week 0 intentionally has no Poll Zero ranking, even when games are complete.
  if (Number(selectedWeek) === 0) {
    document.getElementById("rankings").innerHTML = `
      <li class="no-rankings-message">No Poll Zero rankings for Week 0. Week 1 uses the AP Top 25.</li>
    `;
    return;
  }

  // Load the official FBS team list.
// This determines which teams are eligible to appear in Poll Zero.
const fbsTeamNames = await fetchFBSTeamNames();

  // Get AP / CFP rankings for the selected week.
  // This lets us compare Poll Zero against human / committee rankings.
  let officialRankings = [];

  // Load the official AP / CFP rankings for the selected week.
  if (selectedWeek !== "all") {
    try {
      officialRankings = await fetchOfficialRankings(selectedYear, selectedWeek);
    } catch (error) {
      // A failed AP request follows the same Week 1 unavailable path as no poll.
      if (Number(selectedWeek) !== 1) throw error;
    }
  }

  // Use Poll Zero week numbering when filtering games.
  // In 2026, kickoff calendar dates determine the Poll Zero week.
  if (selectedWeek !== "all") {
    games = games.filter(
      game => getPollZeroWeek(game, selectedYear) <= Number(selectedWeek)
    );
  }

  // Week 1 uses AP Top 25 only.
  // Poll Zero begins as a preview in Week 2.
  if (Number(selectedWeek) === 1) {
    const apPoll = officialRankings?.[0]?.polls?.find(
      poll => poll.poll === "AP Top 25"
    );

    if (apPoll && apPoll.ranks?.length > 0) {
      const list = document.getElementById("rankings");

      list.innerHTML = "";

      apPoll.ranks.slice(0, 25).forEach(item => {
        const li = document.createElement("li");
        li.classList.add("ap-only-row");

        li.innerHTML = `
  <div class="ap-only-team">
    <span class="ap-rank">${item.rank}.</span>
    <span class="ap-team-name">${item.school}</span>
    <span class="ap-label">AP</span>
  </div>
`;

        list.appendChild(li);
      });

      return;
    }

    // Missing AP data must not fall through to a Poll Zero ranking in Week 1.
    document.getElementById("rankings").innerHTML = `
      <li class="no-rankings-message">AP Top 25 rankings are unavailable for this week.</li>
    `;
    return;
  }

  const officialRankMap = buildOfficialRankMap(officialRankings, selectedWeek);

  let previousRankMap = {};

  // Week 2 is the first public Poll Zero preview, so movement begins in Week 3.
  const showMovement = selectedWeek !== "all" && Number(selectedWeek) >= 3;
  if (showMovement) {
    const prevWeek = Number(selectedWeek) - 1;

    const prevGames = games.filter(
      game => getPollZeroWeek(game, selectedYear) <= prevWeek
    );

    const prevRankings = buildPollZeroRankings(
  prevGames,
  prevWeek,
  fbsTeamNames
);

    // Compare against the previous displayed Top 25; other teams are NEW.
    previousRankMap = getRankMap(prevRankings.slice(0, 25));
  }

 const rankings = buildPollZeroRankings(
  games,
  selectedWeek,
  fbsTeamNames
);
  const logoMap = await fetchTeamLogos();

  


  const list = document.getElementById("rankings");

  list.innerHTML = "";

// Week 2 is an early Poll Zero preview.
// Opponent outcome data is still developing.
if (Number(selectedWeek) === 2) {
  const previewMessage = document.createElement("li");

  previewMessage.classList.add("poll-zero-preview");

  previewMessage.innerHTML = `
    <strong>Poll Zero Preview</strong><br>
    Early-season ratings are still developing.
  `;

  list.appendChild(previewMessage);
}


  if (rankings.length === 0) {
    list.innerHTML = `
      <li class="no-rankings-message">
        Poll Zero rankings will appear after the first completed games of the ${selectedYear} season.
      </li>
    `;

    return;
  }

  rankings.slice(0, 25).forEach((team, index) => {
    const currentRank = index + 1;
    const previousRank = previousRankMap[team.name];

    let movement = "";

    if (showMovement && previousRank !== undefined) {
      const change = previousRank - currentRank;

      if (change > 0) movement = `<span class="up">↑ ${change}</span>`;
      if (change < 0) movement = `<span class="down">↓ ${Math.abs(change)}</span>`;
      if (change === 0) movement = `<span class="same">—</span>`;

    } else if (showMovement) {
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

    // Get top score contributors for hover explanation.
    // Sort by absolute point impact so biggest positive/negative contributors show first.
    //clean working


    const topPositive = team.breakdown
      .filter(item => item.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);

    const topNegative = team.breakdown
      .filter(item => item.points < 0)
      .sort((a, b) => a.points - b.points)
      .slice(0, 2);

    const topContributors = [
      "<strong>Poll Zero Breakdown</strong>",
      "",
      "<strong>Top Positive</strong>",
      ...topPositive.map(item => `• ${item.opponent}: +${item.points}`),
      "",
      "<strong>Top Negative</strong>",
      ...topNegative.map(item => `• ${item.opponent}: ${item.points}`),
      "",
      `Total Points: ${team.score}`,
      `Games Played: ${team.gamesPlayed}`,
      "",
      `${team.score} ÷ ${team.gamesPlayed} = ${team.rating.toFixed(1)}`
    ].join("\n");



    li.innerHTML = `
<div class="team-row">
  <span>${currentRank}. ${logo} ${team.name} ${movement}</span>

  <span
    class="rating-value breakdown-trigger"
    data-breakdown="${topContributors}"
  >
    ${team.rating.toFixed(1)}
  </span>
</div>
  

  <div class="rating-bar">
    <div class="rating-fill" style="width: ${barWidth}%; background: ${barColor};"></div>
  </div>

<div class="record-text">
  (${team.wins}-${team.losses}) ${officialRankMap[team.name] ? `| ${getPollNameForWeek(selectedWeek) === "AP Top 25" ? "AP" : "CFP"} #${officialRankMap[team.name]}` : "| NR"}
</div>
`;



    list.appendChild(li);
  });
}

const supportsHover = window.matchMedia(
  "(hover: hover) and (pointer: fine)"
).matches;


const breakdownPopup = document.getElementById("breakdown-popup");
let activeBreakdownTrigger = null;
let ignorePopupScrollUntil = 0;
let ignorePopupMouseoutUntil = 0;


document.addEventListener("mouseover", (event) => {

  const trigger = event.target.closest(".breakdown-trigger");

  if (!trigger) return;

  const triggerPosition = trigger.getBoundingClientRect();

  breakdownPopup.innerHTML = trigger.dataset.breakdown;
  breakdownPopup.querySelectorAll("strong").forEach((heading) => {
    if (heading.textContent === "Top Positive") {
      heading.style.color = "#7CFC90";
    }

    if (heading.textContent === "Top Negative") {
      heading.style.color = "#ff8080";
    }
  });

  breakdownPopup.style.display = "block";

  const popupWidth = breakdownPopup.offsetWidth;
  const rightSpace = window.innerWidth - triggerPosition.right;

  if (rightSpace < popupWidth + 10) {
    breakdownPopup.style.left = `${triggerPosition.left - popupWidth - 10}px`;
  } else {
    breakdownPopup.style.left = `${triggerPosition.right + 10}px`;
  }

  const popupHeight = breakdownPopup.offsetHeight;
  const bottomSpace = window.innerHeight - triggerPosition.top;

  if (bottomSpace < popupHeight + 10) {
    breakdownPopup.style.top = `${window.innerHeight - popupHeight - 10}px`;
  } else {
    breakdownPopup.style.top = `${triggerPosition.top}px`;
  }

  document.addEventListener("mouseout", (event) => {
    const trigger = event.target.closest(".breakdown-trigger");

    if (!trigger) return;

    breakdownPopup.style.display = "none";
  });

  window.addEventListener("scroll", () => {
    if (Date.now() < ignorePopupScrollUntil) return;

    breakdownPopup.style.display = "none";
    activeBreakdownTrigger = null;
  });

  //click funtionality
  //blank

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".breakdown-trigger");

    if (!trigger) {
      breakdownPopup.style.display = "none";
      return;
    }

    const triggerPosition = trigger.getBoundingClientRect();

    breakdownPopup.innerHTML = trigger.dataset.breakdown;
    breakdownPopup.querySelectorAll("strong").forEach((heading) => {
      if (heading.textContent === "Top Positive") {
        heading.style.color = "#7CFC90";
      }

      if (heading.textContent === "Top Negative") {
        heading.style.color = "#ff8080";
      }
    });

    breakdownPopup.style.display = "block";

    const popupWidth = breakdownPopup.offsetWidth;
    const rightSpace = window.innerWidth - triggerPosition.right;

    if (rightSpace < popupWidth + 10) {
      breakdownPopup.style.left =
        `${triggerPosition.left - popupWidth - 10}px`;
    } else {
      breakdownPopup.style.left =
        `${triggerPosition.right + 10}px`;
    }

    const popupHeight = breakdownPopup.offsetHeight;
    const bottomSpace = window.innerHeight - triggerPosition.top;

    if (bottomSpace < popupHeight + 10) {
      breakdownPopup.style.top =
        `${window.innerHeight - popupHeight - 10}px`;
    } else {
      breakdownPopup.style.top = `${triggerPosition.top}px`;
    }
  });

});

yearSelect.addEventListener("change", () => {
  loadRankings();
});

const weekSelect = document.getElementById("week-select");

weekSelect.addEventListener("change", () => {
  loadRankings();
});

window.loadRankings = loadRankings;

// Disable future choices on first visit, before the user loads a ranking.
// Keep numbered weeks unavailable until the schedule establishes availability.
Array.from(weekSelect.options).forEach(option => {
  option.disabled = option.value !== "all";
});
const initialScheduleYear = yearSelect.value;
fetchGames(initialScheduleYear).then(games => {
  if (yearSelect.value === initialScheduleYear) {
    updateWeekAvailability(games, initialScheduleYear);
  }
}).catch(error => {
  console.error("Unable to determine available Poll Zero weeks:", error);
});
