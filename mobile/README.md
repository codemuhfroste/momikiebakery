# Momikie's POS — mobile app (Flutter)

An offline-first register for phones and tablets. It talks to the same
website and Turso database through `/api/mobile/*`; the phone never holds
database credentials.

## What it does

It looks and lays out like the website: the same Geist type, colours, navy
sidebar, cards, tables and badges (`lib/widgets/web.dart` and `shell.dart`
mirror `src/components/ui.tsx` and `AppShell.tsx`). From 1024 px wide — e.g.
the Infinix XPAD in landscape — it uses the sidebar layout; narrower screens
get the top bar and ☰ menu, as on the website.

- **Register** — products beside the current sale (pinned while the products
  scroll); search or scan (a USB/Bluetooth scanner works without tapping the
  search box); change a line's price (flagged "Not SRP", recorded as a price
  override); a Retail / Wholesale switch (wholesale sells by the product's pack
  — box, case, dozen… — and works offline too); checkout by Cash, GCash, Maya, Card or Credit (with optional down
  payment).
- **Transactions** — any day's recorded sales with the website's figures,
  filters and badges, plus anything still saved on the tablet.
- **Credit Accounts** — the website's customers table (balance, aging, last
  activity, status); tap a customer to record a payment (applied to the oldest
  unpaid receipts first).
- **Sync** — online/offline status, what's waiting, anything the server
  couldn't accept, recently synced receipts, sign out.
- **Dashboard, Products, Inventory, End of Day, Sales Report, Scanner Check**
  (and for the owner, **Audit Log** and **Staff**) — the website's own pages,
  shown inside the app with the app's sign-in (`lib/screens/web_page.dart`; the
  site drops its sidebar when the `momikie_app` cookie is set). They need
  internet. Excel downloads open Android's share sheet (save to Drive/Files or
  send); Excel import and product photos use the file picker. Links to the
  Register, Transactions or Credit Accounts switch to the app's own pages.
  Printing works from the website in a browser, not inside the app.

## Offline mode

1. Signing in the first time needs internet. After that the app opens and
   sells with no connection. The phone stays signed in for 7 days (the website:
   12 hours); deactivating a staff member on the Staff page cuts their phone off
   at once. Don't sign out during a blackout — signing in again needs internet.
2. Every sale and payment is saved on the phone first (the outbox), with a
   random id, and applied to the phone's copy of stock and balances at once.
3. When there's a connection — on start, when Wi-Fi/data returns, every
   minute while something is waiting, or **Sync now** — the outbox is sent
   oldest first. The server records each id once, so a dropped connection
   mid-sync can never double a sale.
4. Sales get their receipt number when they reach the server, dated when they
   actually happened. A sale made offline that ran out of stock or passed a
   credit limit is still recorded (it already happened) but flagged for the
   owner on the website ("Mobile app" badge, "⚠ Check" note, Audit Log).
5. Anything the server can't accept stays on the phone under **Needs
   attention** with the reason, until someone retries or removes it.

## Run / build

```bash
flutter pub get
flutter run                                              # against https://momikiebakery.vercel.app
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000   # Android emulator → local `npm run dev`
flutter test                                             # offline/sync and layout tests
flutter build apk --release                              # build/app/outputs/flutter-apk/app-release.apk
```

The server address can also be changed on the sign-in screen ("Server address").

Debug builds install as a separate app, "Momikie's POS (dev)"
(`com.momikie.momikie_pos.dev`), so testing against a local server never
touches sales waiting in the real app. With a USB-connected device:
`adb reverse tcp:3000 tcp:3000` then
`flutter run --dart-define=API_BASE_URL=http://localhost:3000`.

The app keeps the website's type weights even when Android's "Bold text"
accessibility setting is on (see `main.dart`).

The release APK is signed with the debug key (fine for installing directly on
the store's devices). Publishing to the Play Store needs a proper upload key.
