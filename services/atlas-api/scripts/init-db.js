require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });
const pool = require("../db");

const sql = `
CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  original_name TEXT        NOT NULL,
  stored_path   TEXT        NOT NULL,
  size_bytes    BIGINT      NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

(async () => {
  try {
    await pool.query(sql);
    console.log("✓ documents table ready");
  } catch (err) {
    console.error("✗ DB init failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();