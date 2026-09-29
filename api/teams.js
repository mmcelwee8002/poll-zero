export default async function handler(req, res) {
  // Errors must never populate the CDN cache. Override only after validation.
  res.setHeader("Cache-Control", "no-store");
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
  if (!Array.isArray(data) || data.length === 0 || data.some(team =>
    !team || typeof team.school !== "string" || !team.school.trim())) {
    return res.status(502).json({ message: "Invalid FBS teams response" });
  }
  // The request URL (including year) separates seasons at the CDN.
  // Six hours fresh, then up to one hour during background revalidation.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=21600, stale-while-revalidate=3600");
  res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ message: "Unable to retrieve FBS teams" });
  }
}
