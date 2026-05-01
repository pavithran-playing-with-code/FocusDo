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

// GET — last 30 days history (individual sessions)
router.get("/history", async (req, res, next) => {
  try {
    const [rows] = await db.execute(`
      SELECT id, duration_min, type, completed, created_at
      FROM pomodoro_sessions
      WHERE completed = 1
        AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// DELETE — single session
router.delete("/:id", async (req, res, next) => {
  try {
    await db.execute("DELETE FROM pomodoro_sessions WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Session deleted" });
  } catch (err) { next(err); }
});

// DELETE — all history
router.delete("/", async (req, res, next) => {
  try {
    await db.execute("DELETE FROM pomodoro_sessions");
    res.json({ success: true, message: "All history cleared" });
  } catch (err) { next(err); }
});

module.exports = router;
