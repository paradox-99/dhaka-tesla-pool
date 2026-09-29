import { createApp, logger } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`api listening on port ${env.PORT}`);
});
