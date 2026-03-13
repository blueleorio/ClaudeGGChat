import express from "express";
import { verifyGoogleJwt } from "./middleware/verifyGoogleJwt";
import { checkSpaceAllowlist } from "./middleware/checkSpaceAllowlist";
import { handleChatEvent } from "./handlers/chatEvent";
import { validateEnv } from "./utils/validateEnv";

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Chain: JWT verify → space allowlist → event handler
app.post("/", verifyGoogleJwt, checkSpaceAllowlist, handleChatEvent);

// Only start listening when this file is the entry point (not imported by tests)
if (require.main === module) {
  validateEnv();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
