import "dotenv/config";
import { createApp, logger } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

const app = createApp();

app.listen(port, () => {
  logger.info(`api listening on port ${port}`);
});
