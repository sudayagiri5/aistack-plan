const express = require("express");

const healthRoutes = require("./routes/health");
const documentRoutes = require("./routes/document");
const chatRoutes = require("./routes/chat");

const app = express();

app.use(express.json());

app.use("/health", healthRoutes);
app.use("/api/document", documentRoutes);
app.use("/api/chat", chatRoutes);

module.exports = app;