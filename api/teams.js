export default async function handler(req, res) {
  const { year } = req.query;
  const url = new URL("https://api.collegefootballdata.com/teams/fbs");
  // CFBD supports historical membership through the optional season year.
  if (year !== undefined) {
    if (typeof year !== "string" || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ message: "Invalid year" });
    }
    url.searchParams.set("year", year);
  }
  try {
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.CFBD_API_KEY}`,
    },
  });
  if (!response.ok) {
    return res.status(response.status).json({ message: "Unable to retrieve FBS teams" });
  }

  const data = await response.json();
  res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ message: "Unable to retrieve FBS teams" });
  }
}
