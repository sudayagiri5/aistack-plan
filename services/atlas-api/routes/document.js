const express = require("express");

const router = express.Router();

router.post("/upload", (req, res) => {
  res.json({
    message: "Document upload endpoint created",
    nextStep: "We will connect real file upload processing next",
  });
});

module.exports = router;