const express = require("express");

const router = express.Router();

router.post("/ask", (req, res) => {
  res.json({
    message: "Chat ask endpoint created",
    nextStep: "We will connect this to the AI service next",
  });
});

module.exports = router;