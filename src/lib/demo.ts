// The "FOR DEMO PURPOSES ONLY" banner, for showing the system with sample
// data. Off unless the DEMO_MODE environment variable is on:
//
//   DEMO_MODE=on   (in Vercel → Settings → Environment Variables, then redeploy)
//
// The mobile app shows the same banner (it reads this from /api/mobile/bootstrap).
const DEMO_MODE = ["on", "true", "1", "yes"].includes((process.env.DEMO_MODE ?? "").trim().toLowerCase());

export const SHOW_DEMO_BANNER = DEMO_MODE;
