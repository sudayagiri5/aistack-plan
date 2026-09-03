const express = require("express");

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";

// POST /api/chat/ask — forward a question to the AI service
router.post("/ask", async (req, res) => {
  const { question, document_id, top_k } = req.body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A non-empty 'question' string is required" });
  }

  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}/chat/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, document_id, top_k }),
    });

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      return res.status(aiResponse.status).json({
        error: data.detail || "AI service returned an error",
      });
    }

    res.json(data);
  } catch (err) {
    console.error("AI service call failed:", err.message);
    res.status(503).json({ error: "AI service unavailable" });
  }
});
// POST /api/chat/agent — forward to the agentic endpoint
router.post("/agent", async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "A non-empty 'question' string is required" });
  }

  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}/chat/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await aiResponse.json();
    if (!aiResponse.ok) {
      return res.status(aiResponse.status).json({ error: data.detail || "AI service returned an error" });
    }
    res.json(data);
  } catch (err) {
    console.error("AI service call failed:", err.message);
    res.status(503).json({ error: "AI service unavailable" });
  }
});
module.exports = router;