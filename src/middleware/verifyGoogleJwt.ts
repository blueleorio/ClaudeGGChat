import { OAuth2Client } from "google-auth-library";
import { Request, Response, NextFunction } from "express";

const client = new OAuth2Client();

export async function verifyGoogleJwt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.BOT_ENDPOINT,
    });
    const payload = ticket.getPayload();
    if (
      !payload?.email_verified ||
      !payload.email?.endsWith("gserviceaccount.com")
    ) {
      res.status(401).json({ error: "Invalid token issuer" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Token verification failed" });
  }
}
