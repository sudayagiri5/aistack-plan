require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });
const pool = require("../db");

const sql = `
CREATE TABLE IF NOT EXISTS action_items (
  id          SERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  detail      TEXT,
  document_id INTEGER     REFERENCES documents(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

(async () => {
  try {
    await pool.query(sql);
    console.log("✓ action_items table ready");
  } catch (err) {
    console.error("✗ action_items init failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();