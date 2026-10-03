// Switches for the client demo, controlled by one environment variable so
// going live needs no code change:
//
//   DEMO_MODE=off   (in Vercel → Settings → Environment Variables, then redeploy)
//
// Anything else — including not setting it — keeps the demo behaviour below.
// See `npm run go-live` and the README's go-live checklist.
const DEMO_MODE = !["off", "false", "0", "no"].includes((process.env.DEMO_MODE ?? "").trim().toLowerCase());

// Shows a banner on every page saying the site is a demo with sample data.
export const SHOW_DEMO_BANNER = DEMO_MODE;

// Lets staff (the cashier login) use the owner's tabs — Dashboard, Products,
// Inventory, Scanner Check, and adding/editing credit customers — so the
// whole system can be shown from one login. The Audit Log and voiding sales
// stay owner-only either way.
export const STAFF_SEES_OWNER_TABS = DEMO_MODE;
