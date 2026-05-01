const router = require("express").Router();
const db = require("../config/db");

// GET — all tasks for a device (with subtask counts)
router.get("/", async (req, res, next) => {
  const { device_id } = req.query;
  if (!device_id)
    return res.status(400).json({ success: false, message: "device_id is required" });
  try {
    const [rows] = await db.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
       FROM tasks t
       WHERE t.device_id = ?
       ORDER BY t.priority DESC, t.created_at DESC`,
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
    const [rows] = await db.execute(
      `SELECT t.*, 0 AS subtask_total, 0 AS subtask_done FROM tasks t WHERE t.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — edit task text
router.patch("/:id/edit", async (req, res, next) => {
  const { text, device_id } = req.body;
  if (!text?.trim())
    return res.status(400).json({ success: false, message: "text is required" });
  try {
    await db.execute(
      "UPDATE tasks SET text = ? WHERE id = ? AND device_id = ?",
      [text.trim(), req.params.id, device_id]
    );
    const [rows] = await db.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
       FROM tasks t WHERE t.id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle done
router.patch("/:id/toggle", async (req, res, next) => {
  try {
    await db.execute("UPDATE tasks SET done = NOT done WHERE id = ?", [req.params.id]);
    const [rows] = await db.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
       FROM tasks t WHERE t.id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle priority
router.patch("/:id/priority", async (req, res, next) => {
  try {
    await db.execute(
      "UPDATE tasks SET priority = NOT priority WHERE id = ? AND device_id = ?",
      [req.params.id, req.body.device_id]
    );
    const [rows] = await db.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
       FROM tasks t WHERE t.id = ?`,
      [req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE — all completed tasks for a device  ⚠️ must stay before /:id
router.delete("/clear/done", async (req, res, next) => {
  const { device_id } = req.query;
  try {
    // Also delete subtasks of completed tasks
    if (device_id) {
      const [doneTasks] = await db.execute(
        "SELECT id FROM tasks WHERE done = 1 AND device_id = ?", [device_id]
      );
      for (const t of doneTasks) {
        await db.execute("DELETE FROM subtasks WHERE task_id = ?", [t.id]);
      }
      await db.execute("DELETE FROM tasks WHERE done = 1 AND device_id = ?", [device_id]);
    } else {
      await db.execute("DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE done = 1)");
      await db.execute("DELETE FROM tasks WHERE done = 1");
    }
    res.json({ success: true, message: "Completed tasks cleared" });
  } catch (err) { next(err); }
});

// DELETE — single task
router.delete("/:id", async (req, res, next) => {
  try {
    await db.execute("DELETE FROM subtasks WHERE task_id = ?", [req.params.id]);
    await db.execute("DELETE FROM tasks WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Task deleted" });
  } catch (err) { next(err); }
});

// ── Subtasks ──────────────────────────────────────────────────────────────────

// GET — subtasks for a task
router.get("/:id/subtasks", async (req, res, next) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST — add subtask
router.post("/:id/subtasks", async (req, res, next) => {
  const { text } = req.body;
  if (!text?.trim())
    return res.status(400).json({ success: false, message: "text is required" });
  try {
    const [result] = await db.execute(
      "INSERT INTO subtasks (task_id, text) VALUES (?, ?)",
      [req.params.id, text.trim()]
    );
    const [rows] = await db.execute("SELECT * FROM subtasks WHERE id = ?", [result.insertId]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH — toggle subtask + auto-complete master
router.patch("/:taskId/subtasks/:subId/toggle", async (req, res, next) => {
  try {
    await db.execute("UPDATE subtasks SET done = NOT done WHERE id = ?", [req.params.subId]);

    const [[{ total }]] = await db.execute(
      "SELECT COUNT(*) AS total FROM subtasks WHERE task_id = ?", [req.params.taskId]
    );
    const [[{ doneCount }]] = await db.execute(
      "SELECT COUNT(*) AS doneCount FROM subtasks WHERE task_id = ? AND done = 1", [req.params.taskId]
    );

    if (total > 0 && doneCount === total) {
      await db.execute("UPDATE tasks SET done = 1 WHERE id = ?", [req.params.taskId]);
    } else {
      await db.execute("UPDATE tasks SET done = 0 WHERE id = ?", [req.params.taskId]);
    }

    const [subs] = await db.execute(
      "SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC", [req.params.taskId]
    );
    const [tasks] = await db.execute(
      `SELECT t.*,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.done = 1) AS subtask_done
       FROM tasks t WHERE t.id = ?`,
      [req.params.taskId]
    );
    res.json({ success: true, subtasks: subs, task: tasks[0] });
  } catch (err) { next(err); }
});

// DELETE — subtask
router.delete("/:taskId/subtasks/:subId", async (req, res, next) => {
  try {
    await db.execute("DELETE FROM subtasks WHERE id = ?", [req.params.subId]);

    const [[{ total }]] = await db.execute(
      "SELECT COUNT(*) AS total FROM subtasks WHERE task_id = ?", [req.params.taskId]
    );
    const [[{ doneCount }]] = await db.execute(
      "SELECT COUNT(*) AS doneCount FROM subtasks WHERE task_id = ? AND done = 1", [req.params.taskId]
    );

    if (total === 0 || doneCount < total) {
      await db.execute("UPDATE tasks SET done = 0 WHERE id = ?", [req.params.taskId]);
    }

    res.json({ success: true, message: "Subtask deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
