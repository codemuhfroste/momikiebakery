// Switches for the client demo. Set both to false before the store starts
// using the system for real (and run `npm run db:reset` to clear the demo
// data — see README).

// Shows a banner on every page saying the site is a demo with sample data.
export const SHOW_DEMO_BANNER = true;

// TEMPORARY: lets staff (the cashier login) use the owner's tabs —
// Dashboard, Products, Inventory, Scanner Check, and adding/editing credit
// customers — so the whole system can be shown from one login. The Audit Log
// and voiding sales stay owner-only.
export const STAFF_SEES_OWNER_TABS = true;
