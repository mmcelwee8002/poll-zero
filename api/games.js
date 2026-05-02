export default async function handler(req, res) {
  const { year, week } = req.query;

  let url = `https://api.collegefootballdata.com/games?year=${year}&seasonType=regular&classification=fbs`;

  if (week) {
    url += `&week=${week}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.CFBD_API_KEY}`,
    },
  });

  const data = await response.json();
  res.status(200).json(data);
}