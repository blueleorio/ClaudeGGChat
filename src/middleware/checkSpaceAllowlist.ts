import { Request, Response, NextFunction } from "express";

export function checkSpaceAllowlist(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.log("BODY:", JSON.stringify(req.body, null, 2));
  const allowedSpaces = (process.env.ALLOWED_SPACE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const spaceName: string =
    req.body?.chat?.appCommandPayload?.message?.space?.name ?? "";

  if (!allowedSpaces.includes(spaceName)) {
    // Silent rejection — no error card shown to users in unauthorized spaces
    console.log("Blocked space:", spaceName);
    res.status(200).json({});
    return;
  }
  next();
}
