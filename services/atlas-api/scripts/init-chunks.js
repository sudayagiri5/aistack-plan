require("dotenv").config({ path: require("path").join(__dirname, "../../../.env") });
const pool = require("../db");

const sql = `
CREATE TABLE IF NOT EXISTS chunks (
  id           SERIAL PRIMARY KEY,
  document_id  INTEGER     NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER     NOT NULL,
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
`;

(async () => {
  try {
    await pool.query(sql);
    console.log("✓ chunks table ready");
  } catch (err) {
    console.error("✗ chunks init failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();