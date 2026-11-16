# Mehfil Restaurant OS

Offline-first restaurant management app with local storage, a SQLite sync service, and an Electron desktop wrapper.

## Run on the restaurant PC

1. Install Node.js 24 or newer and run `npm install`.
2. Build the web app with `npm run build`.
3. Start the desktop app with `npm run desktop`.
4. The desktop app starts the local SQLite sync server on port `47821`. Its database and generated sync token are stored separately from the installation in the OS app-data directory (`%APPDATA%/mehfil-restaurant-os/data` on Windows).
5. In Settings, copy the token from `sync-token.txt` on the restaurant PC. Keep this file private.

The app remains usable when offline. IndexedDB and local storage remain the local working copy; changes are sent to the server when connectivity returns. The server keeps a versioned snapshot in `restaurant.sqlite`. If two devices change data from the same revision, the app pauses automatic sync and asks whether to use the server copy or the current device copy.

## Table service workflow

- A waiter selects a table or takeaway/delivery, adds dishes, and uses **Create & send to kitchen**. The order is saved locally, appears on the kitchen display, and reserves a dine-in table.
- A cashier can open waiter orders from the notification bell, print/send the KOT, and generate the paid bill. Cashiers must send the order before the bill action is enabled.
- Kitchen staff advance tickets through Preparing, Ready, and Served. Ready and waiter orders are shown in the cashier notification control. Devices sync on a 30-second polling interval when connected; this is not push/instant notification delivery.
- A table is released only after its order is paid or cancelled. Cashiers and administrators can remove an unused table in Settings; tables with active orders are protected and past orders remain in history.
- Cancelling an unpaid order restores the exact recipe stock consumed by that order. Reprinting an unchanged ticket does not deduct stock again.

## Menu, inventory, and reports

- When adding a menu item, optional Half and Full prices create click-to-order serving-size cards. The recipe editor accepts ingredient amounts per full serving; Half uses half of those amounts.
- Default menu recipes are estimates. Set the actual recipes and opening stock before using inventory figures for purchasing or service decisions. Items without a recipe do not deduct ingredients.
- Inventory deductions occur when an order is sent to the kitchen. Orders are blocked if their recipe would drive tracked stock below zero. Inventory cost and estimated profit use saved menu-item cost estimates.
- “Other” expenses require a name. Daily, weekly, and monthly reports calculate estimated profit as paid sales minus logged expenses minus estimated item costs.
- Close the current Morning or Evening shift to save a report snapshot. Closing totals include the shift’s paid orders and that date’s logged expenses; cash in hand is cash sales minus the amount entered as submitted. Expenses do not currently track a payment method, so cash expenses are not separately subtracted from cash in hand.

## Roles and access

- Owner: dashboard, reports, kitchen, menu, inventory, and settings/account management; no POS or bill actions.
- Cashier: POS, kitchen, expenses, reports, closing, menu, inventory, and settings.
- Waiter: order taking and kitchen submission only.
- Kitchen: kitchen display only.
- Role checks are enforced by the app UI on each device, not by server-side authentication. Do not expose the sync server to an untrusted network or use this configuration as a substitute for production security controls.

## Connect another device on the restaurant network

- Keep the desktop app running on the main PC.
- On the other device, open `http://<restaurant-PC-LAN-address>:47821/`.
- In Settings, use `/api` as the server address and enter the token copied from the server PC.
- The sync server is bound to the local network. Use a trusted private network; do not expose this plain-HTTP endpoint to the public internet.

For remote access outside the restaurant network, deploy the server behind HTTPS and configure the public API URL in Settings. Configure firewall rules and backups before using real restaurant data.

## Develop

- `npm run backend` starts the API and serves the production build on port `47821`.
- `npm run dev` starts Vite on port `5173`; `/api` is proxied to the local backend.
- `npm run build` type-checks and builds the web app.
- `npm run desktop:build` builds the web app and opens it in Electron.
- `npm run dist:win` creates a Windows NSIS installer in `release/`.
- `npm run dist:portable` creates a portable Windows desktop executable in `release/`.

The backend creates `data/sync-token.txt` on first launch. Keep the token and SQLite database private, and back up the database regularly. Staff accounts remain local to each device; the sync service shares restaurant data and inventory, not account credentials or the active POS cart.

Financial values are estimates until the restaurant enters accurate opening stock, recipes, and item costs. New installations start without pre-filled expense records; do not treat sample menu costs or inventory balances as audited accounting data.

Windows packages are currently unsigned. Windows SmartScreen or an organization’s application-control policy may prevent running them; obtain a trusted code-signing certificate and have the device administrator approve the app for production deployment.
