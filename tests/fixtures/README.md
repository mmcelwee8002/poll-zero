These public CFBD response snapshots were retrieved on 2026-09-12 using server-side authentication. No credentials are stored here.

- `fbs-2025.json` and `fbs-2026.json`: `/teams/fbs?year=YEAR`, retaining school names only (136 and 138 teams respectively).
- `polls-2014.json`: `/rankings?year=2014&seasonType=regular`, retaining Weeks 9–11 and AP/CFP school/rank entries.
- `polls-2025.json`: the same rankings endpoint for 2025, retaining Weeks 10–12.

CFBD documents the optional season year at https://github.com/CFBD/cfbd-python/blob/main/docs/TeamsApi.md#get_fbs_teams.
The captured first CFP weeks are 2014 Week 10 and 2025 Week 11. The preceding and following weeks make these availability transitions permanent offline regressions.

Run all permanent suites from the repository root:

```
node tests/downstream-scoring.cjs
node tests/calendar-weeks.cjs
node tests/reliability.cjs
```
