# Momikie's POS — mobile app (Flutter)

An offline-first register for phones and tablets. It talks to the same
website and Turso database through `/api/mobile/*`; the phone never holds
database credentials.

## What it does

- **Register** — search or scan (a Bluetooth/USB scanner types into the search
  box), category filters, product photos, cart, and checkout by Cash, GCash,
  Maya, Card or Credit (with optional down payment).
- **Sales** — today's sales recorded on the server, plus anything still on the phone.
- **Credit** — customers and balances; record payments (applied to the oldest
  unpaid receipts first).
- **Sync** — online/offline status, what's waiting, anything the server
  couldn't accept, recently synced receipts, sign out.

## Offline mode

1. Signing in the first time needs internet. After that the app opens and
   sells with no connection.
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
flutter test                                             # offline/sync tests
flutter build apk --release                              # build/app/outputs/flutter-apk/app-release.apk
```

The server address can also be changed on the sign-in screen ("Server address").

The release APK is signed with the debug key (fine for installing directly on
the store's devices). Publishing to the Play Store needs a proper upload key.
