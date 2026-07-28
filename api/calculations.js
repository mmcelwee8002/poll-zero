export default function handler(req, res) {
    const { year, week } = req.query;
  
    if (!year) {
      return res.status(400).json({
        message: "Year is required"
      });
    }
  
    return res.status(200).json({
      message: "Poll Zero calculation endpoint is working",
      year,
      week: week || "all"
    });
  }