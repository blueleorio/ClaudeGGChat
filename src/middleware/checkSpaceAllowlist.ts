import { Request, Response, NextFunction } from "express";

export function checkSpaceAllowlist(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const allowedSpaces = (process.env.ALLOWED_SPACE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // const spaceName: string = req.body?.space?.name ?? "";
  const spaceName: string =
    req.body?.chat?.appCommandPayload?.message?.space?.name ?? "";

  const threadName: string =
    req.body?.chat?.appCommandPayload?.message?.thread?.name ?? "";

  const prompt: string =
    req.body?.chat?.appCommandPayload?.message?.argumentText?.trim() ?? "";

  // console.log("BODY:", JSON.stringify(req.body, null, 2));
  console.log("Received spaceName:", spaceName);
  console.log("Received threadName:", threadName);
  console.log("Received promt:", prompt);

  if (!allowedSpaces.includes(spaceName)) {
    // Silent rejection — no error card shown to users in unauthorized spaces
    console.log("You stuck at checkSpaceAllowlist.ts:");
    res.status(200).json({});
    return;
  }
  next();
}
