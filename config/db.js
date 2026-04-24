const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
  port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT) || 3306,
  user: process.env.MYSQLUSER || process.env.DB_USER || "root",
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || "focusdo",
  waitForConnections: true,
  connectionLimit: 10,
  timezone: "+00:00",
});

pool.getConnection()
  .then(conn => { console.log("🔗 FocusDo DB connected"); conn.release(); })
  .catch(err => { console.error("❌ DB connection failed:", err.message); process.exit(1); });

module.exports = pool;
