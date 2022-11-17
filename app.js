const express = require('express');
const app = express();
const port = 3000;
require('dotenv').config();

const { alumniUpdates, newbieUpdates } = require('./memberUpdates');
const wildapricot = require('./wildApricot');

// start express server on port 3000
app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});

// initialize wildapricot client
const wildApricotApiClient = wildapricot.init();

app.get('/', (req, res) => {
  try {
    return res.status(200).send('SB Newcomers Scripts');
  } catch (e) {
    console.error(e);
    return res.status(500).send(e.message);
  }
});

app.get('/memberUpdates', async (req, res) => {
  try {
    alumniUpdates(wildApricotApiClient);
    newbieUpdates(wildApricotApiClient);
    return res.status(200).send('Member updates processing');
  } catch (e) {
    console.error(e);
    return res.status(500).send(e.message);
  }
});
