const router = require("express").Router();
const db = require("../config/db");

// POST — save a completed session
router.post("/", async (req, res, next) => {
  const { duration_min, type = "focus", completed = 1 } = req.body;
  if (!duration_min)
    return res.status(400).json({ success: false, message: "duration_min is required" });
  try {
    const [result] = await db.execute(
      "INSERT INTO pomodoro_sessions (duration_min, type, completed) VALUES (?, ?, ?)",
      [duration_min, type, completed ? 1 : 0]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// GET — today's focus session count + total minutes
router.get("/today", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        COUNT(*)        AS total_sessions,
        COALESCE(SUM(duration_min), 0) AS total_minutes
      FROM pomodoro_sessions
      WHERE DATE(created_at) = CURDATE()
        AND type      = 'focus'
        AND completed = 1
    `);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// GET — last 7 days summary
router.get("/history", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        DATE(created_at)               AS date,
        COUNT(*)                       AS sessions,
        COALESCE(SUM(duration_min), 0) AS minutes
      FROM pomodoro_sessions
      WHERE type = 'focus' AND completed = 1
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
