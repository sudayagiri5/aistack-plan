require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const app = require("./app");

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`atlas-api listening on ${port}`);
});