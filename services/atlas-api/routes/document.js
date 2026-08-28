const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("../db");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// POST /api/documents — upload file + save metadata
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (field name must be 'file')" });
  }
  try {
    const { originalname, path: storedPath, size } = req.file;
    const result = await pool.query(
      `INSERT INTO documents (original_name, stored_path, size_bytes)
       VALUES ($1, $2, $3)
       RETURNING id, original_name, size_bytes, status, created_at`,
      [originalname, storedPath, size]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Upload insert failed:", err.message);
    res.status(500).json({ error: "Failed to save document" });
  }
});

// GET /api/documents — list all documents
router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT id, original_name, size_bytes, status, created_at
     FROM documents ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

module.exports = router;