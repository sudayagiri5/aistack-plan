const express = require("express");
const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "atlas-api" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`atlas-api listening on ${port}`));
