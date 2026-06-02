// api/rankings.js
// This endpoint securely gets AP / CFP rankings from CollegeFootballData.
// The API key stays hidden in Vercel as CFBD_API_KEY.

export default async function handler(req, res) {
  const { year, week } = req.query;

  const response = await fetch(
    `https://api.collegefootballdata.com/rankings?year=${year}&week=${week}&seasonType=regular`,
    {
      headers: {
        Authorization: `Bearer ${process.env.CFBD_API_KEY}`,
      },
    }
  );

  const data = await response.json();

  res.status(200).json(data);
}