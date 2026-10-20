# Aqua LIMS (MERN)

Aquarium water-quality LIMS, rebuilt from the DevExpress XAF app (`D:\Projects\AquaLIMS`) on MongoDB, Express, React and Node.js. The full build specification is in [docs/AquaLIMS_MERN_Migration_Spec.md](docs/AquaLIMS_MERN_Migration_Spec.md).

## What it does

- **Reference data**: measurement types, units, parameter categories, parameters, aquatic environments, water sources, treatment types, species groups, species and their parameter limits (LCL / Ideal / UCL).
- **Tanks**: species kept in each tank and per-tank limit overrides. The **effective limit** per parameter is the strictest species window, replaced by a tank override when there is one.
- **Results**: samples and tank readings. Each result shows its limit and status (Low / OK / High / No limit); out-of-range rows are red.
- **Tank health**: Stable / Warning / Critical / No data, computed from the latest result per parameter.
- **Water management**: water preparations (sources, treatments, readings) and water changes. A water change whose prepared water is critically out of range needs an **override note**.
- **Platform**: users, roles and per-type permissions; full audit trail; per-user grid layouts; CSV / XLSX / PDF export; Home dashboard.

## Requirements

- Node.js 20 or later (tested with 22).
- MongoDB 7 running as a **replica set** (transactions). Either:
  - `npm run db`: starts a local single-node replica set on `127.0.0.1:27017` using the official `mongod` binary from `mongodb-memory-server` (downloaded once, about 600 MB, into `%USERPROFILE%\.cache\mongodb-binaries`). Data lives in `.data/mongo`.
  - or `docker compose up -d` (Docker required).
- For the SQL Server migration only: Windows with the *ODBC Driver 17 for SQL Server* and access to the XAF database.

## Getting started

```bash
npm install
copy server\.env.example server\.env      # then edit JWT_SECRET and passwords
npm run dev                               # MongoDB + API (http://localhost:4000) + web (http://localhost:5173)
```

In a second terminal, fill the database **once**, either with:

```bash
npm run migrate                           # your real data from the XAF SQL Server database
```

or with the reference data and demo records from the spec:

```bash
npm run seed
```

Open http://localhost:5173 and sign in as **Admin** with `SEED_ADMIN_PASSWORD` (default `Admin@123`). You'll be asked to choose a new password. The **User** account (role *Default*) can only manage its own profile, exactly like XAF's Default role. Grant it access under **Administration → Roles**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | MongoDB + API (auto-restart) + Vite dev server |
| `npm run db` | Only the local MongoDB replica set |
| `npm run seed` | Seed reference data + demo records into an empty database (`-- --reset`, `-- --no-demo`, `-- --reset-accounts`) |
| `npm run migrate` | Copy the data you created in the XAF SQL Server database into MongoDB. Old-model tables (`Genus`, `Source`, `SpeciesType`) and orphaned rows are kept in `legacy*` archive collections. XAF framework tables (users/roles/permissions, audit trail, model differences, XPO type tables) are not copied unless you add `-- --with-security` / `-- --with-audit`. Other options: `-- --dry-run`, `-- --reset`, `-- --no-legacy`. Writes `migration-report-*.json`. |
| `npm test` | Shared calculation tests (spec §15 items 1–24) and API tests against an in-memory replica set |
| `npm run test:e2e` | Playwright smoke test (spec §17) in Microsoft Edge against the running stack. Set `E2E_USER` / `E2E_PASSWORD` to an account that has already changed its password. |
| `npm run typecheck` | TypeScript check of every package |
| `npm run build` then `npm start` | Production build; the API also serves the built client on `API_PORT` |

## Project layout

```
shared/   enums, formatting, the limit / health / alert calculations, the entity registry, validation, navigation, permissions
server/   Express + Mongoose API: generic CRUD driven by the registry, auth, audit, codes, exports, domain endpoints
client/   React + Vite SPA: app shell, data grid, record forms, special screens, admin, Playwright test
scripts/  local MongoDB, seed, SQL Server migration
docs/     the build specification
```

The app is **metadata-driven**, like XAF: `shared/src/entities.ts` describes every entity's fields, rules, list columns, form layout and child grids. The API's CRUD and the UI's lists and forms are generated from it. Behaviour that isn't generic lives in:

- `shared/src/calc.ts`: effective limits, result status, tank health, the water-change check and its Alert Summary text (ported line by line from `WaterChangeAlertService.cs`).
- `server/src/services/crud.ts`: saving a parent and its child rows in one transaction, unique checks, delete protection, the override-note gate, codes, audit.
- `client/src/form/*`: the Copy from Species dialog, live Limit/Status evaluation, unit auto-fill, the Alert Summary panel, and the tank health and effective-limits widgets.

## Behaviour notes

- The spec's **PRESERVE / APPLY** decisions (§16) are implemented as written. For example: limits match by parameter **code**, inactive species still count toward limits, and there is no unit conversion; but codes come from atomic counters, parameter codes are unique, LCL ≤ UCL is enforced, there is one Save per form, and errors show on save.
- Water-preparation and water-change codes (`WP-yyyyMM-###`, `WC-yyyyMM-###`) are previewed on the New form and assigned on save.
- Deleting is a soft delete. Records still referenced elsewhere can't be deleted; the message suggests making them inactive. Child rows (limits, tank species, overrides, sources, treatments, readings, results) are deleted with their parent.
- The session expires after `SESSION_IDLE_MINUTES` (10) of inactivity.
- Lists load every record of a type and sort, filter, group and page in the browser. That is right for the data volumes of this LIMS (hundreds to low thousands of rows per type); the API also supports server-side paging (`?page=&pageSize=`).
