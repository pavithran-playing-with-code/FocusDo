// ─────────────────────────────────────────────────────────────────────────────
//  FocusDo — Express Server  v1.0
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");

const app  = express();
const PORT = process.env.PORT || 5050;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiter ──────────────────────────────────────────────────────────────
app.use("/api/", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests — please try again later." },
}));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "OK", timestamp: new Date().toISOString(), version: "1.0.0" });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/tasks",    require("./routes/tasks"));
app.use("/api/sessions", require("./routes/sessions"));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 FocusDo server running at http://localhost:${PORT}`);
});

module.exports = app;
