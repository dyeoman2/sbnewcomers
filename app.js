const express = require('express');
const app = express();
const port = 3000;
const { init: startNewbieToNewcomer } = require('./NewbieToNewcomerUpdate');
const wildapricot = require('./shared/wildapricot');

const apiClient = wildapricot.init();

// start express server on port 3000
app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});

app.get('/newbieToNewcomer', async (req, res) => {
  try {
    startNewbieToNewcomer(apiClient);
    return res.status(200).send('NewbieToNewcomer processing');
  } catch (e) {
    console.error(e);
    return res.status(500).send(e.message);
  }
});
