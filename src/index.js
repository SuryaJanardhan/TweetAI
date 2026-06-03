import { createApp } from './app.js';

const port = process.env.PORT || 3000;
const { app } = await createApp();
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Tweet-AI API listening on :${port}`);
});
