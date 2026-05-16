const router = require("express").Router();
const db = require("../config/db");

function needsDevice(source) {
  return (req, res, next) => {
    const id = source === "query" ? req.query.device_id : (req.body && req.body.device_id);
    if (!id) return res.status(400).json({ success: false, message: "device_id is required" });
    req.device_id = id;
    next();
  };
}

// POST — save a completed session
router.post("/", needsDevice("body"), async (req, res, next) => {
  const { duration_min, type = "focus", completed = 1 } = req.body;
  if (!duration_min)
    return res.status(400).json({ success: false, message: "duration_min is required" });
  try {
    const [result] = await db.execute(
      "INSERT INTO sessions (device_id, duration_min, type, completed) VALUES (?, ?, ?, ?)",
      [req.device_id, duration_min, type, completed ? 1 : 0]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) { next(err); }
});

// GET — today's focus session count + total minutes for this device
router.get("/today", needsDevice("query"), async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         COUNT(*)                        AS total_sessions,
         COALESCE(SUM(duration_min), 0)  AS total_minutes
       FROM sessions
       WHERE DATE(created_at) = CURDATE()
         AND device_id = ?
         AND type      = 'focus'
         AND completed = 1`,
      [req.device_id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// GET — last 30 days history for this device
router.get("/history", needsDevice("query"), async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, duration_min, type, completed, created_at
       FROM sessions
       WHERE device_id = ?
         AND completed = 1
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY created_at DESC`,
      [req.device_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// DELETE — single session (only if owned by this device)
router.delete("/:id", needsDevice("query"), async (req, res, next) => {
  try {
    const [result] = await db.execute(
      "DELETE FROM sessions WHERE id = ? AND device_id = ?",
      [req.params.id, req.device_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Session not found" });
    res.json({ success: true, message: "Session deleted" });
  } catch (err) { next(err); }
});

// DELETE — clear this device's history only
router.delete("/", needsDevice("query"), async (req, res, next) => {
  try {
    await db.execute("DELETE FROM sessions WHERE device_id = ?", [req.device_id]);
    res.json({ success: true, message: "Your session history cleared" });
  } catch (err) { next(err); }
});

module.exports = router;
