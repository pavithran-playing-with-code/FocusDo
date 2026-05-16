const router = require("express").Router();
const db = require("../config/db");

// Helper: 400 if device_id missing
function needsDevice(source) {
  return (req, res, next) => {
    const id = source === "query" ? req.query.device_id : (req.body && req.body.device_id);
    if (!id) return res.status(400).json({ success: false, message: "device_id is required" });
    req.device_id = id;
    next();
  };
}

// Helper: confirm a task belongs to a device. Returns boolean.
async function taskBelongsTo(taskId, deviceId) {
  const [rows] = await db.execute(
    "SELECT id FROM tasks WHERE id = ? AND device_id = ?",
    [taskId, deviceId]
  );
  return rows.length > 0;
}

const TASK_WITH_COUNTS = `
  SELECT t.*,
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
    (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
  FROM tasks t WHERE t.id = ?`;

// GET — all tasks for a device
router.get("/", needsDevice("query"), async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
       FROM tasks t
       WHERE t.device_id = ?
       ORDER BY t.priority DESC, t.created_at DESC`,
      [req.device_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST — add task
router.post("/", needsDevice("body"), async (req, res, next) => {
  const { text, priority = 0 } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ success: false, message: "text is required" });
  try {
    const [result] = await db.execute(
      "INSERT INTO tasks (text, priority, device_id) VALUES (?, ?, ?)",
      [text.trim(), priority ? 1 : 0, req.device_id]
    );
    const [rows] = await db.execute(
      `SELECT t.*, 0 AS subtask_total, 0 AS subtask_done FROM tasks t WHERE t.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — edit task text
router.patch("/:id/edit", needsDevice("body"), async (req, res, next) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ success: false, message: "text is required" });
  try {
    const [result] = await db.execute(
      "UPDATE tasks SET text = ? WHERE id = ? AND device_id = ?",
      [text.trim(), req.params.id, req.device_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Task not found" });
    const [rows] = await db.execute(TASK_WITH_COUNTS, [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle done
router.patch("/:id/toggle", needsDevice("body"), async (req, res, next) => {
  try {
    const [result] = await db.execute(
      "UPDATE tasks SET done = NOT done WHERE id = ? AND device_id = ?",
      [req.params.id, req.device_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Task not found" });
    const [rows] = await db.execute(TASK_WITH_COUNTS, [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle priority
router.patch("/:id/priority", needsDevice("body"), async (req, res, next) => {
  try {
    const [result] = await db.execute(
      "UPDATE tasks SET priority = NOT priority WHERE id = ? AND device_id = ?",
      [req.params.id, req.device_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: "Task not found" });
    const [rows] = await db.execute(TASK_WITH_COUNTS, [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE — all completed tasks for a device (must stay before /:id)
router.delete("/clear/done", needsDevice("query"), async (req, res, next) => {
  try {
    await db.execute(
      `DELETE FROM subtasks
       WHERE task_id IN (SELECT id FROM tasks WHERE done = 1 AND device_id = ?)`,
      [req.device_id]
    );
    await db.execute(
      "DELETE FROM tasks WHERE done = 1 AND device_id = ?",
      [req.device_id]
    );
    res.json({ success: true, message: "Completed tasks cleared" });
  } catch (err) { next(err); }
});

// DELETE — single task
router.delete("/:id", needsDevice("query"), async (req, res, next) => {
  try {
    if (!(await taskBelongsTo(req.params.id, req.device_id)))
      return res.status(404).json({ success: false, message: "Task not found" });
    await db.execute("DELETE FROM subtasks WHERE task_id = ?", [req.params.id]);
    await db.execute("DELETE FROM tasks WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Task deleted" });
  } catch (err) { next(err); }
});

// ── Subtasks ──────────────────────────────────────────────────────────────────

// GET — subtasks for a task
router.get("/:id/subtasks", needsDevice("query"), async (req, res, next) => {
  try {
    if (!(await taskBelongsTo(req.params.id, req.device_id)))
      return res.status(404).json({ success: false, message: "Task not found" });
    const [rows] = await db.execute(
      "SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST — add subtask
router.post("/:id/subtasks", needsDevice("body"), async (req, res, next) => {
  const { text } = req.body;
  if (!text || !text.trim())
    return res.status(400).json({ success: false, message: "text is required" });
  try {
    if (!(await taskBelongsTo(req.params.id, req.device_id)))
      return res.status(404).json({ success: false, message: "Task not found" });
    const [result] = await db.execute(
      "INSERT INTO subtasks (task_id, text) VALUES (?, ?)",
      [req.params.id, text.trim()]
    );
    const [rows] = await db.execute("SELECT * FROM subtasks WHERE id = ?", [result.insertId]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle subtask + auto-complete master
router.patch("/:taskId/subtasks/:subId/toggle", needsDevice("body"), async (req, res, next) => {
  try {
    if (!(await taskBelongsTo(req.params.taskId, req.device_id)))
      return res.status(404).json({ success: false, message: "Task not found" });

    await db.execute(
      "UPDATE subtasks SET done = NOT done WHERE id = ? AND task_id = ?",
      [req.params.subId, req.params.taskId]
    );

    const [[{ total }]] = await db.execute(
      "SELECT COUNT(*) AS total FROM subtasks WHERE task_id = ?", [req.params.taskId]
    );
    const [[{ doneCount }]] = await db.execute(
      "SELECT COUNT(*) AS doneCount FROM subtasks WHERE task_id = ? AND done = 1", [req.params.taskId]
    );

    const allDone = total > 0 && doneCount === total;
    await db.execute("UPDATE tasks SET done = ? WHERE id = ?", [allDone ? 1 : 0, req.params.taskId]);

    const [subs] = await db.execute(
      "SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC", [req.params.taskId]
    );
    const [tasks] = await db.execute(TASK_WITH_COUNTS, [req.params.taskId]);
    res.json({ success: true, subtasks: subs, task: tasks[0] });
  } catch (err) { next(err); }
});

// DELETE — subtask
router.delete("/:taskId/subtasks/:subId", needsDevice("query"), async (req, res, next) => {
  try {
    if (!(await taskBelongsTo(req.params.taskId, req.device_id)))
      return res.status(404).json({ success: false, message: "Task not found" });

    await db.execute(
      "DELETE FROM subtasks WHERE id = ? AND task_id = ?",
      [req.params.subId, req.params.taskId]
    );

    const [[{ total }]] = await db.execute(
      "SELECT COUNT(*) AS total FROM subtasks WHERE task_id = ?", [req.params.taskId]
    );
    const [[{ doneCount }]] = await db.execute(
      "SELECT COUNT(*) AS doneCount FROM subtasks WHERE task_id = ? AND done = 1", [req.params.taskId]
    );

    if (total === 0 || doneCount < total)
      await db.execute("UPDATE tasks SET done = 0 WHERE id = ?", [req.params.taskId]);

    res.json({ success: true, message: "Subtask deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
