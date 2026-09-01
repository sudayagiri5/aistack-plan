require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });
const pool = require("../db");

const sql = `
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
`;

(async () => {
  try {
    await pool.query(sql);
    console.log("✓ pgvector enabled, embedding column ready");
  } catch (err) {
    console.error("✗ vector init failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();