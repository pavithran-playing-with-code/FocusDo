const router = require("express").Router();
const db = require("../config/db");

// GET — all tasks for a device
router.get("/", async (req, res, next) => {
  const { device_id } = req.query;
  if (!device_id)
    return res.status(400).json({ success: false, message: "device_id is required" });
  try {
    const [rows] = await db.execute(
      "SELECT * FROM tasks WHERE device_id = ? ORDER BY priority DESC, created_at DESC",
      [device_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST — add task
router.post("/", async (req, res, next) => {
  const { text, priority = 0, device_id } = req.body;
  if (!text?.trim())
    return res.status(400).json({ success: false, message: "text is required" });
  if (!device_id)
    return res.status(400).json({ success: false, message: "device_id is required" });
  try {
    const [result] = await db.execute(
      "INSERT INTO tasks (text, priority, device_id) VALUES (?, ?, ?)",
      [text.trim(), priority ? 1 : 0, device_id]
    );
    const [rows] = await db.execute("SELECT * FROM tasks WHERE id = ?", [result.insertId]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle done
router.patch("/:id/toggle", async (req, res, next) => {
  try {
    await db.execute("UPDATE tasks SET done = NOT done WHERE id = ?", [req.params.id]);
    const [rows] = await db.execute("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE — single task
router.delete("/:id", async (req, res, next) => {
  try {
    await db.execute("DELETE FROM tasks WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Task deleted" });
  } catch (err) { next(err); }
});

// DELETE — all completed tasks for a device
router.delete("/clear/done", async (req, res, next) => {
  const { device_id } = req.query;
  try {
    const query = device_id
      ? "DELETE FROM tasks WHERE done = 1 AND device_id = ?"
      : "DELETE FROM tasks WHERE done = 1";
    const params = device_id ? [device_id] : [];
    await db.execute(query, params);
    res.json({ success: true, message: "Completed tasks cleared" });
  } catch (err) { next(err); }
});

module.exports = router;
