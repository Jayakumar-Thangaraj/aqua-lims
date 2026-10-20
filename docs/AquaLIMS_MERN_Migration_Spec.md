# AquaLIMS → MERN Migration Spec (Build Prompt + Knowledge Document)

> **How to use this file.** Give this whole document to the model that will build the new app. Section 0 is the prompt. Sections 1–17 are the knowledge base it must follow. Everything here was taken from the XAF source code, both model layers (`Model.DesignedDiffs.xafml` and `AquaLIMS.Web/Model.xafml`), the SQL Server database, and the running application (checked on 2026-10-19).
>
> Source solution: `D:\Projects\AquaLIMS` (DevExpress XAF 20.1.4, ASP.NET Web Forms, .NET Framework 4.6.1, XPO ORM, SQL Server `(local)\SQL2022`, database `AquaLIMS`).

---

## 0. The Prompt

You are a senior full-stack engineer. Rebuild **Aqua LIMS**, a laboratory information management system for aquarium water quality, as a production-quality **MERN** application (MongoDB, Express, React, Node.js). The current app is a DevExpress XAF Web Forms application. This document describes every entity, rule, calculation, screen, and behaviour of that app. Your job is **functional parity** plus the specific improvements marked **APPLY** below.

**Rules for you:**

1. Implement every entity in §4, every rule in §5–§6, and every screen in §9–§10. Nothing in this document is optional unless it says **OPTIONAL** or **OUT OF SCOPE**.
2. Where this document lists a **Decision**, use the stated default. Do not ask questions; build.
3. Items marked **APPLY** are deliberate fixes of bugs or weak spots in the XAF app. Implement the fixed behaviour.
4. Items marked **PRESERVE** are odd but intentional (or depended on). Keep them exactly, even if they look wrong.
5. The calculations in §5 must produce **exactly** the outputs in the worked examples and in §15. Write automated tests for each one.
6. Ignore the folder `D:\Projects\AquaLIMS\AquaLIMS.MERN`. It is an early prototype that models a "Species Profile" layer the real app does not have. Do not reuse its data model.
7. Deliver a monorepo:
   ```
   aqualims/
     server/   Express + Mongoose API (Node 20 LTS)
     client/   React 18 + Vite SPA
     shared/   constants, enums, validation schemas and calculation code used by both
     scripts/  seed + SQL Server → MongoDB migration
     docker-compose.yml   MongoDB as a single-node replica set (needed for transactions)
     README.md
   ```
8. Put all domain calculations (§5) in `shared/` so the client can show live previews and the server re-computes authoritatively on save.
9. Provide: seed script with the reference data in §13, a migration script per §14, unit tests for §5, API tests for §6, and an end-to-end smoke test of the main flows in §15.

**Recommended libraries (Decision):** TypeScript everywhere; React Router 6; TanStack Query; TanStack Table (or AG Grid Community) for grids; React Hook Form + Zod; Zod shared between client and server; Mongoose 8; `decimal.js` for all limit arithmetic; `argon2` (or `bcrypt`) for passwords; `exceljs` and `pdfmake` (or equivalents) for export; Vitest + Supertest + Playwright for tests.

---

## 1. Product Overview

Aqua LIMS records and checks water quality for aquarium tanks. The core idea is **limits**: each species has acceptable lower and upper control limits (LCL / UCL) for water parameters (pH, temperature, ammonia, …). A tank's acceptable range comes from the species living in it, unless the tank overrides a parameter. Every measured result is checked against the tank's effective limits.

**Main workflows**

1. **Set up reference data**: measurement types, units, parameter categories, parameters, aquatic environments, water sources, treatment types, species groups, species and their parameter limits.
2. **Set up tanks**: name, code, volume, environment, the species kept in the tank, and optional per-tank limit overrides.
3. **Record results** two ways:
   - **Samples**: a water sample taken from a tank, with one result per parameter.
   - **Tank Readings**: readings taken directly in the tank at a point in time (routine, before/after a water change, before/after medication).
   Each result shows its applicable limit and a status (Low / OK / High / No limit). Out-of-range rows are highlighted red.
4. **Tank health**: each tank shows an overall level (Stable / Warning / Critical / No data) and an explanation, computed from the latest result per parameter.
5. **Prepare water**: a water preparation batch records the source water(s) used, treatments applied, and readings of the prepared water.
6. **Water changes**: log a water change for a tank using a prepared batch. The app compares the batch's readings with the tank's limits. If any parameter is critically out of range, saving requires an **override note**.

**Glossary**

| Term | Meaning |
|---|---|
| LCL / UCL | Lower / Upper Control Limit. Inclusive bounds. |
| Ideal | Optimal value for a species (field `OptimalValue`, shown as "Ideal"). Informational only; not used in calculations. |
| Effective limit | The LCL/UCL that applies to a parameter for a specific tank (§5.1). |
| Parameter code | Short code such as `pH`, `NH3`, `TDS`. **Limits are matched by parameter code, not by parameter id** (§5.1). |
| Override | A tank-specific limit that replaces the species limits for that parameter. |
| Override note | Text the user must enter to save a water change whose prepared water is critically out of range. |

---

## 2. Source System Inventory (what exists in XAF)

### 2.1 Projects

| Project | Contents |
|---|---|
| `AquaLIMS.Module` | Business objects, domain service (`WaterChangeAlertService`), helper functions, database updater (seeds users/roles), model diffs, icons (`Images/`). |
| `AquaLIMS.Module.Web` | Web controllers (`ListViewController`, `DetailViewController`, `SpeciesParameterLimitImportController`), web module (popup sizing, batch-edit model updater). |
| `AquaLIMS.Web` | ASP.NET host: `WebApplication.cs`, `Global.asax.cs`, `Default.aspx` (custom CSS + popup auto-fit script), `Login.aspx`, `Error.aspx`, `Web.config`, `Model.xafml`. |
| `AquaLIMS.MERN` | Stale prototype. **Ignore** (see §0 rule 6). |

### 2.2 XAF modules registered

| Module | Used by the domain? | Decision for MERN |
|---|---|---|
| System, SystemAspNet | Yes (core) | Rebuild as app shell. |
| Security (SecurityStrategyComplex, AuthenticationStandard, PermissionPolicyUser/Role) | Yes | Rebuild (§7). |
| Validation | Yes | Rebuild (§6). |
| Conditional Appearance | Yes (red rows) | Rebuild (§9.6). |
| Audit Trail | Yes, actively writing (1,036 rows) | Rebuild (§8). |
| BusinessClassLibraryCustomization | Framework | Not needed. |
| KPI (Definition, Scorecard screens in nav) | No data | **OUT OF SCOPE**. Replace with the Home dashboard (§10.0). |
| Dashboards ("Reports" nav group) | No data | **OUT OF SCOPE**. Home dashboard covers it. |
| Chart | Not used | **OUT OF SCOPE**. |
| Notifications (bell with count in header) | Not used (always 0) | **OUT OF SCOPE**. Do not show the bell. |
| Scheduler (Event, Resource) | Not used | **OUT OF SCOPE**. |
| Workflow | Not used | **OUT OF SCOPE**. |
| File Attachments | Not used | **OUT OF SCOPE**. |
| View Variants | Not used (one removed variant) | **OUT OF SCOPE**. |
| Theme switcher (palette menu: Aqua, Black Glass, DevEx, Glass, Office 2003/2010 variants, Plastic Blue, Red Wine, Soft Orange, Youthful; default `MaterialCompact`) | Cosmetic | **OUT OF SCOPE**. One theme (§9.1). |
| Localization (`Languages = de;es;ja;ru` in Web.config; no translations exist) | No | **OPTIONAL**: keep UI strings in one `en` resource file so i18n can be added later. |

---

## 3. Architecture & Non-Functional Requirements

- **Database:** MongoDB 7, run as a single-node replica set so multi-document transactions work. A parent and its nested children are always saved in **one transaction** (XAF saves a form and its nested grids together).
- **Collections:** one collection per entity (§4). Child records hold a reference to their parent (`tankId`, `speciesId`, …). This supports both nested grids inside a parent form and the standalone list screens for child entities that exist in XAF (e.g. *Tank Species*, *Species Parameter Limit*, *Sample Parameter*).
- **IDs:** MongoDB `ObjectId`. Migrated records keep the old GUID in `legacyOid`.
- **Numbers:** XPO stored decimals with 4 decimal places (SQL `money`). Store numbers as JS `Number` **rounded to 4 decimal places on save**. Do all limit arithmetic (§5) with `decimal.js`.
- **Display format** for all measured values, limits, volumes and amounts: 2 decimals with thousands separator (`{0:n2}` → `1,234.50`). Edit mask also 2 decimals.
- **Dates:** store UTC. Display in the user's local time. XAF shows date-time fields as **date only** (`10/19/2026`), while storing the full timestamp; **PRESERVE** (show date; keep time in storage; date pickers allow time where noted in §4).
- **Soft delete:** XPO used deferred deletion (`GCRecord`). Implement soft delete: `deletedAt` + `deletedBy`. All queries, lookups, unique checks and code generators ignore soft-deleted records.
- **Timestamps:** every collection gets `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Auth session:** XAF forms cookie with a **10-minute** sliding timeout. Use an httpOnly cookie session (or JWT access + refresh in httpOnly cookies) with a 10-minute idle timeout, configurable via env.
- **Multiple browser tabs** must work at the same time (XAF had `EnableMultipleBrowserTabsSupport = true`).
- **Deep links:** XAF had a URL per screen (`/Tank_ListView/`, `/Tank_DetailView/<id>/`). Provide routes per list and per record (§10).
- **Errors:** global error boundary on the client; consistent JSON error shape on the server `{ message, code, details? }`; server logs errors with request id. XAF had a "rich error report" page (`Error.aspx`); a friendly error page is enough.
- **Validation errors** come back as HTTP 422 with `details: [{ field, rule, message }]` so the form can mark fields.

---

## 4. Data Model

Conventions in this section:

- **Req** = required. **Uniq** = unique among non-deleted records, compared **case-insensitively and trimmed** (SQL Server's default collation made XAF's unique rule case-insensitive).
- **Required numbers**: a value must be present; **0 is valid** (the data has limits saved as 0 – 0, so XAF accepted 0).
- String length: XPO's default for a string with no size attribute is **100** characters. "Unlimited" = no limit (memo / textarea).
- "Display name" = the value shown when another record references this one (XAF `DefaultProperty`).
- "Description banner" = the text shown above the entity's main list screen (§9.4).

### 4.0 Base fields

XAF had two base classes.

**`AquaBaseObject`** (used by most entities, marked **[ABO]** below):

| Field | Type | Default | Notes |
|---|---|---|---|
| `active` | Boolean | `true` on create | Caption "Active". Tooltip "Enable this to show elsewhere." Shown as a **toggle switch**, never a checkbox. |
| `createdDate` | Date | now, on create | Caption "Created Date". |
| `lastUpdatedDate` | Date | set to now on every save | Caption "Last Updated Date". |

**`BaseObject`** only (no Active / Created / Last Updated): `AquaticEnvironment` (has its own `active`), `WaterSource`, `WaterPreparation`, `WaterPrepSource`, `WaterPrepTreatment`, `WaterChange`.

**Decision (APPLY):** In MERN, `createdDate`/`lastUpdatedDate` map to `createdAt`/`updatedAt` and are **always read-only system fields**. In XAF, several forms (Sample, Sample Parameter, Tank Parameter Override, Water Prep Reading, Species Group, Tank Reading) wrongly show Created Date and Last Updated Date as **editable** inputs. Show them read-only, and only on the forms listed in §10.

### 4.1 Enums

Store enums as strings (the key). Show the caption. Migration must map XPO's integer values (§14).

| Enum | Key (int in SQL) → Caption |
|---|---|
| `SampleStatus` | `Pending` (0) → "Pending", `InProgress` (1) → "In Progress", `Completed` (2) → "Completed" |
| `TankReadingContext` | `Routine` (0) → "Routine", `BeforeWaterChange` (1) → "Before Water Change", `AfterWaterChange` (2) → "After Water Change", `BeforeMedication` (3) → "Before Medication", `AfterMedication` (4) → "After Medication", `Other` (5) → "Other" |
| `WaterPreparationStatus` | `Preparing` (0) → "Preparing", `Ready` (1) → "Ready", `PartiallyUsed` (2) → "Partially Used", `Used` (3) → "Used" |
| `WaterChangeStatus` | `Planned` (0) → "Planned", `InProgress` (1) → "In Progress", `Completed` (2) → "Completed" |
| `WaterVolumeUnit` | `MilliLitre` (0) → "mL", `Litre` (1) → "L", `Gallon` (2) → "gal" |
| `ResultStatus` (computed) | `NoLimit` → "No limit" (no icon), `Low` → "Low" (down-chevron icon), `OK` → "OK" (green diamond icon), `High` → "High" (up-chevron icon) |
| `TankHealthLevel` (computed) | `NoData` → "No data" (no icon), `Stable` → "Stable" (green check icon), `Warning` → "Warning" (yellow warning icon), `Critical` → "Critical" (red cross icon) |
| `AlertSeverity` (computed) | `InRange`, `Borderline`, `OutOfRange` |

### 4.2 Reference data ("Utils")

#### MeasurementType [ABO]
Display name: `measurementTypeName`. Banner: "Define the kinds of measurement that units are grouped under (e.g. Concentration, Temperature, Volume)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `measurementTypeName` | Measurement Type | String(100) | Req, Uniq |

#### Unit [ABO]
Display name: `unitName`. Banner: "Define the units used to record measured values and volumes (e.g. Celsius, Gram, dKH)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `unitName` | Unit Name | String(100) | Req, Uniq |
| `unitSymbol` | Unit Symbol | String(100) | Req (not unique) |
| `measurementTypeId` | Measurement Type | → MeasurementType | optional |
| `description` | Description | String(100) | |
| `sortOrder` | Sort Order | Integer | default 0 |

#### Category [ABO]
Display name: `categoryName`. Banner: "Define the categories that group water quality parameters (e.g. Hardness, Nitrogen Cycle, Dissolved Solids)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `categoryName` | Category Name | String(100) | Req, Uniq |
| `description` | Description | String(200) | |

#### Parameter [ABO]
Display name: `parameterName`. Banner: "Define the water quality parameters tested in samples, tank readings and water preparation (e.g. pH, Ammonia, Carbonate Hardness)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `parameterName` | Parameter Name | String(100) | Req, Uniq |
| `parameterCode` | Parameter Code | String(100) | Req. **Not unique in XAF.** |
| `categoryId` | Category | → Category | Req |
| `description` | Description | Unlimited | |
| `defaultUnitId` | Default Unit | → Unit | optional |
| `sortOrder` | Sort Order | Integer | default 0. Hidden in list view. |

**Decision (APPLY):** Make `parameterCode` **unique (case-insensitive)**. All limit matching uses the code (§5.1); two parameters sharing a code would silently merge limits. Current data has no duplicates.

#### AquaticEnvironment (BaseObject)
Display name: `environment`. Banner: "Define the water sources used in tank setup and water preparation batches (e.g. Fresh water, Marine)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `environment` | Environment | String(50) | Req, Uniq |
| `description` | Description | String(150) | 3-row textarea |
| `active` | Active | Boolean | default `true` |

#### WaterSource (BaseObject)
Display name: `source`. Banner: "Define the sources of water used in water preparation batches (e.g. Dechlorinated Tap Water, Distilled Water, Borehole / Well Water)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `source` | "Water Source" on the form, "Source" in the list | String(50) | Req, Uniq |
| `description` | Description | String(150) | 3-row textarea |

No `active` field.

#### TreatmentType [ABO]
Display name: `treatmentTypeName`. Banner: "Define the treatments applied to water during preparation (e.g. Dechlorination, Clarifying, Bacterial Boosting)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `treatmentTypeName` | Treatment Type | String(100) | Req, Uniq |
| `description` | Description | String(100) | 2-row textarea |

#### SpeciesGroup [ABO]
Display name: `groupName`. Banner: "Broad genus-level category; groups closely related species that share identical water parameters and general care requirements"

| Field | Caption | Type | Rules |
|---|---|---|---|
| `groupName` | Group Name | String(100) | Req, Uniq |
| `description` | Description | String(150) | |

#### Species [ABO]
Display name: `speciesName`. Banner: "Individual species entry; holds unique scientific name, common name, and specific care details within its group"

| Field | Caption | Type | Rules / UI |
|---|---|---|---|
| `speciesName` | Species Name | String(100) | Req, Uniq. Placeholder "e.g. Oncorhynchus mykiss". Tooltip "Scientific (Latin) name of the species". |
| `commonName` | Common Name | String(100) | Placeholder "e.g. Rainbow trout". Tooltip "Everyday name shown on reports". |
| `speciesGroupId` | Species Group | → SpeciesGroup | optional. Placeholder "Select a group (optional)". |
| `description` | Description | String(150) | 2-row textarea. Placeholder "Optional notes about this species". |
| children | Parameter Limits | SpeciesParameterLimit[] | **Owned** (deleted with the species). |

#### SpeciesParameterLimit [ABO]
Display name: the parameter's name. Banner: "Define the acceptable lower and upper limits of each water parameter for a species (e.g. pH 6.5 – 7.5, Temperature 20 – 26 °C)."

| Field | Caption | Type | Rules / UI |
|---|---|---|---|
| `speciesId` | Species | → Species | Req (parent) |
| `parameterId` | Parameter | → Parameter | Req. **On change, set `unitId` = the parameter's `defaultUnitId`** (§5.6). |
| `lcl` | LCL | Number | Req |
| `ucl` | UCL | Number | Req |
| `optimalValue` | **Ideal** | Number | optional (default 0) |
| `unitId` | Unit | → Unit | optional. Shown as the unit **symbol**. Lookup = Unit lookup (§9.7). |
| `notes` | Notes | Unlimited | 4-row textarea |

**Decision (APPLY):** Validate `lcl <= ucl` (message: "LCL must be less than or equal to UCL."). If `optimalValue` is not 0, validate `lcl <= optimalValue <= ucl` (message: "Ideal must be between LCL and UCL."). XAF had no such rule; current data satisfies it.

**Decision (APPLY):** Prevent the same parameter twice on one species (message: "This parameter already has a limit for this species."). XAF did not enforce it, but the Copy from Species action already skips duplicates.

### 4.3 Tanks

#### Tank [ABO]
Display name: `tankName`. Banner: "Define the tanks being monitored, with their volume, environment and inhabitants (e.g. River Setup Tank, Nano Tank)."

| Field | Caption | Type | Rules / UI |
|---|---|---|---|
| `tankName` | Tank Name | String(100) | Req, Uniq |
| `tankCode` | Tank Code | String(100) | Req, Uniq |
| `volume` | Volume | Number | n2. (No unit is stored for tank volume.) |
| `sourceId` | Source | → AquaticEnvironment | optional. Shows `environment`. Lookup lists **active** environments only. |
| `notes` | Notes | Unlimited | |
| `healthLevel` | Health | computed, read-only | §5.4 |
| `healthSummary` | Health Detail | computed, read-only | §5.4 |
| children | Tank Species | TankSpecies[] | **Owned** |
| children | Parameter Overrides | TankParameterOverride[] | **Owned** |
| related | Samples | Sample[] | Not owned (§4.6 delete rules) |
| related | Tank Readings | TankReading[] | Not owned |

#### TankSpecies [ABO]
Display name: the species. Banner: "Define the species kept in a tank; their parameter limits set the tank's acceptable ranges (e.g. Cherry Shrimp in River Setup Tank)."

| Field | Caption | Type | Rules / UI |
|---|---|---|---|
| `tankId` | Tank | → Tank | Req (parent) |
| `speciesId` | Species | → Species | Req. **Displayed by `commonName`** in grids and in the lookup. |
| `notes` | Notes | Unlimited | |

#### TankParameterOverride [ABO]
Display name: the parameter. Banner: "Define tank-specific parameter limits that replace the species limits for that tank (e.g. pH 6.0 – 7.5)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `tankId` | Tank | → Tank | Req (parent) |
| `parameterId` | Parameter | → Parameter | Req |
| `lcl` | LCL | Number | Req |
| `ucl` | UCL | Number | Req |
| `notes` | Notes | Unlimited | |

**Decision (APPLY):** validate `lcl <= ucl`; one override per parameter per tank.

### 4.4 Sampling

#### Sample [ABO]
Display name: `sampleCode`. Banner: "Record the water samples collected from tanks for testing (e.g. weekly routine sample, post-treatment check)."

| Field | Caption | Type | Default | Rules |
|---|---|---|---|---|
| `sampleCode` | Sample Code | String(100) | — (typed by user) | Req, Uniq |
| `tankId` | Tank | → Tank | | Req |
| `collectedDate` | Collected Date | Date | now | |
| `volume` | Volume | Number | 0 | n2 |
| `volumeUnitId` | Volume Unit | → **Unit** (a reference, not the WaterVolumeUnit enum) | | **PRESERVE** this difference |
| `status` | Status | SampleStatus | `Pending` | |
| `notes` | Notes | Unlimited | | |
| children | Sample Parameters | SampleParameter[] | | Owned in MERN (see §4.6) |

#### SampleParameter [ABO]
Display name: the parameter. Banner: "Record the result of each parameter tested in a sample, checked against the tank's limits (e.g. pH 7.0)."

| Field | Caption | Type | Default | Rules |
|---|---|---|---|---|
| `sampleId` | Sample | → Sample | | Req (parent) |
| `parameterId` | Parameter | → Parameter | | Req |
| `measuredValue` | Measured Value | Number | | Req, n2 |
| `unitId` | Unit | → Unit | | optional |
| `limitRange` | Limit | computed, read-only | | §5.2 using the **sample's tank** |
| `resultStatus` | Status | computed, read-only | | §5.2 |
| `testedDate` | Tested Date | Date | now | |
| `notes` | Notes | Unlimited | | |

### 4.5 Tank Readings

#### TankReading [ABO]
Display name: `readingDate`. Record title format: `"{tank display name} {readingDate as short date}"` (e.g. "River Setup Tank 10/19/2026"). Banner: "Record the parameter readings taken from a tank at a point in time (e.g. routine check, before or after a water change)."

| Field | Caption | Type | Default | Rules |
|---|---|---|---|---|
| `tankId` | Tank | → Tank | | Req |
| `readingDate` | Reading Date | Date | now | |
| `context` | Context | TankReadingContext | `Routine` | |
| `waterChangeId` | Water Change | → WaterChange | | optional. Intended only when context is Before/After Water Change, but **not enforced** in XAF. |
| `notes` | Notes | Unlimited | | |
| children | Parameters | TankReadingParameter[] | | Owned in MERN |

**Decision (APPLY, soft):** when `waterChangeId` is set, show a non-blocking hint if `context` is not Before/After Water Change or if the water change's tank differs from this reading's tank. Do not block saving.

#### TankReadingParameter [ABO]
Display name: the parameter. Banner: "Record the measured value of each parameter in a tank reading, checked against the tank's limits (e.g. Temperature 25 °C)."

| Field | Caption | Type | Rules |
|---|---|---|---|
| `tankReadingId` | Tank Reading | → TankReading | Req (parent) |
| `parameterId` | Parameter | → Parameter | Req |
| `measuredValue` | Measured Value | Number | Req, n2 |
| `unitId` | Unit | → Unit | optional |
| `limitRange` | Limit | computed | §5.2 using the reading's tank |
| `resultStatus` | Status | computed | §5.2 |
| `notes` | Notes | Unlimited | |

There is **no tested date** on this entity; the parent's `readingDate` is the result time.

### 4.6 Water Management

#### WaterPreparation (BaseObject)
Display name: `prepCode`. Banner: "Record the water batches prepared for water changes, with their sources, treatments and readings (e.g. WP-202608-001)."

| Field | Caption | Type | Default | Rules / UI |
|---|---|---|---|---|
| `prepCode` | Prep Code | String(100) | auto `WP-yyyyMM-###` (§5.5) | Req, Uniq, read-only |
| `preparedDate` | Prepared Date | Date | now | |
| `preparedVolume` | Prepared Volume | Number | 0 | n2 |
| `volumeUnit` | Volume Unit | WaterVolumeUnit | `MilliLitre` (enum default) | |
| `status` | Status | WaterPreparationStatus | `Preparing` | |
| `notes` | Notes | Unlimited | | |
| `preparedAmount` | Prepared Amount | computed, list only | | `"{preparedVolume:n2} ({unit caption})"` e.g. `2.00 (L)` (§5.7) |
| children | Sources | WaterPrepSource[] | | **Owned** |
| children | Treatments | WaterPrepTreatment[] | | **Owned** |
| children | Readings | WaterPrepReading[] | | Owned in MERN |

#### WaterPrepSource (BaseObject)
Display name: the water source. Banner: "Record the source water and volume used in a water preparation batch (e.g. 2 L of Packaged Drinking Water)."

| Field | Caption | Type | Default | Rules |
|---|---|---|---|---|
| `waterPreparationId` | Water Preparation | → WaterPreparation | | parent |
| `sourceId` | Source | → WaterSource | | Req. Displays `source`. |
| `volume` | Volume | Number | | Req, n2 |
| `volumeUnit` | Volume Unit | WaterVolumeUnit | **`MilliLitre`** (explicit default) | |

#### WaterPrepTreatment (BaseObject)
Display name: the treatment type. Banner: "Record the treatments applied to a water preparation batch and the amount used (e.g. 0.5 mL Dechlorination)."

| Field | Caption | Type | Default | Rules |
|---|---|---|---|---|
| `waterPreparationId` | Water Preparation | → WaterPreparation | | parent |
| `treatmentTypeId` | Treatment Type | → TreatmentType | | Req |
| `amountUsed` | Amount Used | Number | 0 | n2 |
| `amountUnitId` | Amount Unit | → Unit | | Shown as unit **symbol** |
| `appliedDate` | Applied Date | Date | now | |
| `notes` | Notes | Unlimited | | |

#### WaterPrepReading [ABO]
Display name: the parameter. Banner: "Record the parameter readings of a prepared water batch, checked against the tank's limits before a water change (e.g. TDS 57 ppm)."

| Field | Caption | Type | Default | Rules |
|---|---|---|---|---|
| `waterPreparationId` | Water Preparation | → WaterPreparation | | parent (optional in XAF) |
| `parameterId` | Parameter | → Parameter | | Req |
| `measuredValue` | Measured Value | Number | | Req, n2 |
| `unitId` | Unit | → Unit | | |
| `readingDate` | Reading Date | Date | now | |
| `notes` | Notes | Unlimited | | |

Prep readings have **no** limit/status columns of their own (a batch has no tank). They are checked against a tank only on the Water Change form (§5.3).

#### WaterChange (BaseObject)
Display name: `changeCode`. Form title: "Water Change Log". Banner: "Record the water changes made to tanks, with the volume removed and the prepared water added (e.g. WC-202610-001)."

| Field | Caption | Type | Default | Rules / UI |
|---|---|---|---|---|
| `changeCode` | Change Code | String(100) | auto `WC-yyyyMM-###` (§5.5) | Req, Uniq, read-only |
| `tankId` | Tank | → Tank | | Req. Focused first on the form. Simple dropdown of all tanks. |
| `waterPreparationId` | **Prepared Water** | → WaterPreparation | | Req |
| `changeDate` | Change Date | Date | now | |
| `status` | Status | WaterChangeStatus | `Planned` | |
| `volumeUsed` | **Added Water** | Number | 0 | n2 |
| `volumeUsedUnit` | (no caption; sits beside Added Water) | WaterVolumeUnit | `MilliLitre` | |
| `volumeRemoved` | **Removed Water** | Number | 0 | n2 |
| `volumeRemovedUnit` | (no caption; beside Removed Water) | WaterVolumeUnit | `MilliLitre` | |
| `alertSummary` | Alert Summary | computed, read-only, 8-row text | | §5.3. Form only, not in list. |
| `overrideNote` | Override Note | Unlimited, 2 rows | | Required when critical alerts exist (§6.3). Form only. |
| `notes` | Notes | Unlimited | | |
| `addedWater` | Added Water | computed, list only | | `"{volumeUsed:n2} ({unit})"` |
| `removedWater` | Removed Water | computed, list only | | `"{volumeRemoved:n2} ({unit})"` |
| related | Tank Readings | TankReading[] (where `waterChangeId` = this) | | |

**Decision (APPLY):** also persist `alertsSnapshot` (the alert list at save time: parameterName, parameterCode, measuredValue, lcl, ucl, severity, limitSource, unitSymbol) so the record keeps its evidence even if limits change later. The live `alertSummary` is still computed for display.

**There is no other water-change logic in XAF.** Saving a water change does **not** change the preparation's status, does not deduct volume, and does not create tank readings. Do not invent this.

### 4.7 Relationship & delete rules

| Parent → Child | XAF | MERN |
|---|---|---|
| Species → SpeciesParameterLimit | Aggregated (cascade) | Cascade soft-delete |
| Tank → TankSpecies, TankParameterOverride | Aggregated | Cascade soft-delete |
| WaterPreparation → WaterPrepSource, WaterPrepTreatment | Aggregated | Cascade soft-delete |
| WaterPreparation → WaterPrepReading | Association only | **APPLY:** cascade soft-delete (readings have no meaning without the batch) |
| Sample → SampleParameter | Association only | **APPLY:** cascade soft-delete |
| TankReading → TankReadingParameter | Association only | **APPLY:** cascade soft-delete |
| Tank → Sample, TankReading | Association only | **APPLY:** block deleting a tank that has samples, readings or water changes. Message: "This tank has samples, readings or water changes and can't be deleted. Set it inactive instead." |
| WaterChange → TankReading | Association only | Deleting a water change clears `waterChangeId` on its readings. |
| Any reference data (Unit, Parameter, Species, Category, …) in use | Not checked | **APPLY:** block delete when referenced; message names the first few referencing records. Suggest making it inactive. |

In XAF, nested grids for `Tank.Samples`, `Tank.TankReadings`, `WaterChange.TankReadings` and `WaterPreparation.Readings` hide Link/Unlink. Do not offer link/unlink anywhere.

---

## 5. Business Logic (exact algorithms)

All functions live in `shared/` and use `decimal.js`. Comparisons are on the stored values (4 dp). Ranges are inclusive.

### 5.1 Effective limits for a tank — `resolveEffectiveLimits(tank)`

Returns a map keyed by **parameter code, case-insensitive** → `{ lcl, ucl, source, parameterId, parameterName, defaultUnitSymbol }`.

```
limits = {}
for each tankSpecies of tank (ordered by createdAt ascending):        // PRESERVE: Active flag is NOT checked
    species = tankSpecies.species; if missing, skip
    for each limit of species.parameterLimits:                        // PRESERVE: Active flag is NOT checked
        if limit.parameter missing or parameter.code empty: skip
        code = upper(limit.parameter.code)                             // key compare is case-insensitive
        source = species.speciesName
        if code not in limits:
            limits[code] = { lcl: limit.lcl, ucl: limit.ucl, source }
        else:
            existing = limits[code]
            limits[code] = {
                lcl: max(existing.lcl, limit.lcl),                     // strictest window
                ucl: min(existing.ucl, limit.ucl),
                source: existing.lcl >= limit.lcl ? existing.source : source
            }
for each override of tank.parameterOverrides:
    if override.parameter missing or code empty: skip
    limits[upper(code)] = { lcl: override.lcl, ucl: override.ucl, source: "Tank override" }   // replaces completely
return limits
```

Notes (all **PRESERVE**):
- Inactive tank species, inactive species and inactive limits still count.
- If merging produces `lcl > ucl` (incompatible species), keep it; every value is then out of range. **APPLY (soft):** on the Tank form, show a warning listing parameters whose effective LCL > UCL ("Species in this tank have no overlapping range for: pH").
- XAF iterated tank species in an unspecified order; the `source` label on ties depends on order. Use `createdAt` ascending for determinism.
- Units are **not converted**. A limit in ppm and a result in dGH are compared as raw numbers (the current data has GH/KH limits in ppm while the parameters default to dGH/dKH for Dario dario). **PRESERVE**, and **APPLY (soft):** on result rows, show a small warning icon when the result's unit differs from the effective limit's unit.

### 5.2 Result status — `classifyResult(value, lcl, ucl)`

Strict check, no buffer:

```
value < lcl  → "Low"
value > ucl  → "High"
otherwise    → "OK"
```

For a Sample Parameter (tank = `sample.tank`) or Tank Reading Parameter (tank = `tankReading.tank`):

```
limit = resolveEffectiveLimits(tank)[upper(parameter.code)]
if no tank, no parameter code, or no limit:
    limitRange = ""            resultStatus = "NoLimit"
else:
    limitRange = `${n2(lcl)} – ${n2(ucl)}`      // en dash U+2013 with spaces, e.g. "6.00 – 7.50"
    resultStatus = classifyResult(measuredValue, lcl, ucl)
isOutOfRange = resultStatus in ("Low", "High")  // drives the red row (§9.6)
```

These are **computed on read** from the tank's current limits (they change if limits change later). Compute them server-side in list/detail responses, and client-side for unsaved grid rows (live preview while typing).

### 5.3 Prepared-water check for a water change — `checkReadings(prep, tank)`

Uses a **buffered** classification (different from §5.2):

```
BORDERLINE_FRACTION = 0.05
MIN_BUFFER = 0.1

classify(value, lcl, ucl):
    if lcl <= value <= ucl: return "InRange"
    buffer = max((ucl - lcl) * 0.05, 0.1)
    if value < lcl - buffer or value > ucl + buffer: return "OutOfRange"
    return "Borderline"

checkReadings(prep, tank):
    if prep or tank missing: return []
    limits = resolveEffectiveLimits(tank); if empty: return []
    alerts = []
    for each reading of prep.readings (in reading order):
        if reading.parameter missing or code empty: skip
        limit = limits[upper(code)]; if none: skip
        severity = classify(reading.measuredValue, limit.lcl, limit.ucl)
        if severity == "InRange": skip
        alerts.push({
            parameterName, parameterCode: code, measuredValue,
            lcl: limit.lcl, ucl: limit.ucl, severity, limitSource: limit.source,
            unitSymbol: reading.unit?.symbol ?? reading.parameter.defaultUnit?.symbol ?? ""
        })
    return alerts
```

**Alert Summary text** (shown read-only in an 8-row monospace box on the Water Change form). Reproduce exactly, including symbols and spacing:

```
if tank or prep not selected:
    "Select a tank and a prepared water batch to see the parameter comparison."
else if alerts empty:
    "✓ All checked parameters are within range for {tank.tankName}."
else:
    line "Parameter check — {prep.prepCode} vs {tank.tankName}"            // em dash U+2014
    blank line
    for each alert:
        marker = "✗" if OutOfRange else "⚠"
        unit   = unitSymbol ? " " + unitSymbol : ""
        line "  {marker}  {parameterName padded right to 22 chars} {n2(value)}{unit}   limit: {n2(lcl)} – {n2(ucl)}   [{SEVERITY UPPERCASE}]"
        if limitSource: line "       Source: {limitSource}"
    critical = count of OutOfRange
    if critical > 0 and overrideNote is blank:
        blank line
        line "{critical} critical issue(s) detected — an override note is required to save."
    trim trailing whitespace
```

Severity uppercase strings are `BORDERLINE` and `OUTOFRANGE` (no space).

**APPLY:** In XAF the summary only refreshed after a server round trip. In MERN it must update **live** as soon as Tank or Prepared Water changes, and when the override note is typed (the last line appears/disappears). Render it as a styled panel: green success state, amber rows for Borderline, red rows for OutOfRange, plus the plain-text version for copy/print.

### 5.4 Tank health — `getTankHealth(tank)` → `{ level, summary }`

```
APPROACHING_FRACTION = 0.10

if tank missing: return NoData, ""
limits = resolveEffectiveLimits(tank)
if limits empty: return NoData, "No parameter limits set for this tank."

results = []
for each sample of tank.samples:                         // PRESERVE: inactive/any status counted
    for each r of sample.sampleParameters:  if r.parameter: results.push(parameter, r.measuredValue, when = r.testedDate)
for each reading of tank.tankReadings:
    for each r of reading.parameters:       if r.parameter: results.push(parameter, r.measuredValue, when = reading.readingDate)

latest = results
    filtered to parameters whose code is non-empty and in limits
    grouped by code (case-insensitive)
    → in each group, the result with the greatest `when` (ties: keep first encountered)
if latest empty: return NoData, "No results yet for the parameters that have limits."

critical = []; approaching = []
for each r of latest:
    limit = limits[code]
    range = `${n2(limit.lcl)} – ${n2(limit.ucl)}`
    status = classifyResult(r.value, limit.lcl, limit.ucl)
    if status != OK:
        critical.push(`${parameterName} ${n2(value)} ${lowercase(status)} (limit ${range})`)   // "low" / "high"
        continue
    band = (limit.ucl - limit.lcl) * 0.10
    if band <= 0: continue                                // zero-width limit (e.g. 0 – 0): no "approaching"
    if limit.lcl > 0 and value - limit.lcl <= band:       // LCL of 0 means "lower is better": never warn on the low side
        approaching.push(`${parameterName} ${n2(value)} near lower limit ${n2(limit.lcl)}`)
    else if limit.ucl - value <= band:
        approaching.push(`${parameterName} ${n2(value)} near upper limit ${n2(limit.ucl)}`)

if critical not empty:   return Critical, join(critical ++ approaching, "; ")
if approaching not empty: return Warning, join(approaching, "; ")
summary = latest.length == 1 ? "The latest result is within its limit."
                             : `All ${latest.length} latest results are within limits.`
return Stable, summary
```

Ordering of messages: follow the order of `latest` (group order = first appearance of each code in `results`, where samples come before tank readings).

**Performance (APPLY):** the Tank list shows health for every row. Compute health in one aggregation per page of tanks (load limits, overrides, and the latest result per parameter per tank with `$group`), not N+1 queries. Add indexes on `sampleParameters(sampleId)`, `samples(tankId)`, `tankReadings(tankId, readingDate)`, `tankReadingParameters(tankReadingId)`, and every `*Id` foreign key.

### 5.5 Code generation — `WP-yyyyMM-###` and `WC-yyyyMM-###`

XAF behaviour: when the user clicks **New**, the code is generated immediately: prefix = `WP-` / `WC-` + current year and month (`yyyyMM`, server local time) + `-`; find the highest existing code with that prefix (non-deleted), parse the numeric suffix, add 1; start at 1 each month; pad to at least 3 digits (`001`, … `999`, `1000`).

**APPLY:** XAF's approach races (two users get the same code; the unique rule then blocks one save). In MERN:
- `GET /api/water-preparations/next-code` returns a **preview** for the New form (shown read-only, greyed).
- The **final** code is assigned atomically **on create** using a `counters` collection: `findOneAndUpdate({ _id: "WP-202610" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" })`. When seeding/migrating, initialise counters to the highest existing suffix per month.
- Show the final code in the success toast if it differs from the preview.

### 5.6 Unit auto-fill (Species Parameter Limit)

When the **Parameter** of a Species Parameter Limit changes (and the record is not being loaded), set **Unit** to the parameter's Default Unit (or empty if none). In XAF this happens immediately (`ImmediatePostData`).

**Decision (APPLY):** apply the same auto-fill to Tank Parameter Override (no unit field — skip), Sample Parameter, Tank Reading Parameter and Water Prep Reading **only when their Unit is still empty**. (XAF did not auto-fill these; this is a small usability fix.)

### 5.7 Volume display helper

`formatVolume(value, unit) = `${n2(value)} (${unitCaption})`` → `2.00 (L)`, `0.00 (mL)`. Used by Water Preparation "Prepared Amount" and Water Change "Added Water" / "Removed Water" list columns.

### 5.8 Copy limits from another species ("Copy from Species")

Available only on the Species form's Parameter Limits grid.

1. Opens a dialog titled **"Copy Parameter Limits"** (resizable).
2. Field **"Copy From Species"**: dropdown of every **other** species (excluding the one being edited; for a new unsaved species, none excluded) that has **at least one** limit, sorted by species name. No "new"/"edit" buttons on this dropdown.
3. Below it, a read-only grid **"Parameter Limits"** that reloads when the species changes: one row per limit of the source species that has a parameter, sorted by parameter name. Columns: Parameter, LCL, UCL, Ideal, Unit (symbol). Values n2. Rows are selectable with checkboxes. No new/edit/delete/export on this grid.
4. **OK** copies the **ticked** rows into the current species as new, unsaved rows: parameter, unit, LCL, UCL, Ideal, notes. A row is **skipped** if the current species (including its unsaved rows) already has a limit for that parameter (matched by parameter **id** here).
5. Then refreshes the grid and shows a toast at the top for 4 seconds:
   - `"{n} parameter copied"` / `"{n} parameters copied"`, plus `", {m} skipped (already defined for this species)"` if any were skipped, plus `". Review the values and Save."`
   - Success (green) if at least one was copied, otherwise Warning (amber).
6. Nothing is saved until the user saves the species. **Cancel** or OK with no source species does nothing.

### 5.9 Number formatting

`n2(x)` = locale-aware, 2 decimals, thousands separator (en-US: `1,234.50`). Use one shared formatter.

---

## 6. Validation Rules

Run on the server for every create/update (authoritative) and on the client for instant feedback. **APPLY:** show field errors when the user tries to save (and after a field is touched), **not** as soon as a new form opens. XAF's in-place validation showed a red error icon on empty required fields immediately, which users disliked.

### 6.1 Required fields

| Entity | Required |
|---|---|
| MeasurementType | measurementTypeName |
| Unit | unitName, unitSymbol |
| Category | categoryName |
| Parameter | parameterName, parameterCode, category |
| AquaticEnvironment | environment |
| WaterSource | source |
| TreatmentType | treatmentTypeName |
| SpeciesGroup | groupName |
| Species | speciesName |
| SpeciesParameterLimit | species, parameter, lcl, ucl |
| Tank | tankName, tankCode |
| TankSpecies | tank, species |
| TankParameterOverride | tank, parameter, lcl, ucl |
| Sample | sampleCode, tank |
| SampleParameter | sample, parameter, measuredValue |
| TankReading | tank |
| TankReadingParameter | tankReading, parameter, measuredValue |
| WaterPreparation | prepCode |
| WaterPrepSource | source, volume |
| WaterPrepTreatment | treatmentType |
| WaterPrepReading | parameter, measuredValue |
| WaterChange | changeCode, tank, waterPreparation |

Message format (XAF style): `"{Caption}" must not be empty.`

### 6.2 Unique fields (case-insensitive, trimmed, non-deleted)

MeasurementType.measurementTypeName · Unit.unitName · Category.categoryName · Parameter.parameterName · Parameter.parameterCode (**APPLY**, new) · AquaticEnvironment.environment · WaterSource.source · TreatmentType.treatmentTypeName · SpeciesGroup.groupName · Species.speciesName · Tank.tankName · Tank.tankCode · Sample.sampleCode · WaterPreparation.prepCode · WaterChange.changeCode.

Message: `The "{Caption}" field must be unique. Another record already has this value.` Create matching unique indexes with collation `{ locale: "en", strength: 2 }` and a partial filter `{ deletedAt: null }`.

### 6.3 Water change override gate (rule id `WC_OverrideRequired`)

On save of a Water Change:

```
if tank and waterPreparation are both set:
    alerts = checkReadings(waterPreparation, tank)
    if any alert has severity OutOfRange and overrideNote is blank (whitespace counts as blank):
        reject with 422:
        "Critical out-of-range parameters detected. Add an override note to acknowledge and proceed."
        field: overrideNote
```

Borderline alerts never block saving. The check is re-run when the override note, tank, or prepared water changes.

### 6.4 Added rules (APPLY)

- LCL ≤ UCL on Species Parameter Limit and Tank Parameter Override; Ideal within range when set (§4.2).
- No duplicate parameter per species / per tank override (§4.2, §4.3).
- `parameterCode` unique (§4.2).
- Numbers: reject non-numeric input; volumes and amounts must be ≥ 0. Measured values may be any number (negative allowed, as in XAF).

---

## 7. Security, Users & Roles

### 7.1 XAF setup (source)

- Authentication: user name + password (`AuthenticationStandard`). Passwords hashed with PBKDF2 (`Rfc2898`).
- Users (`PermissionPolicyUser`) and roles (`PermissionPolicyRole`). Seeded by `Updater.cs`:
  - **Admin** (empty password) → role **Administrators** (`IsAdministrative = true`: full access to everything).
  - **User** (empty password) → role **Default**, which only allows: read own user record; navigation to "My Details"; write own `ChangePasswordOnFirstLogon` and `StoredPassword` (change own password); read/write/create own per-user view settings; **deny** reading roles. It grants **no** access to business data.
- `SupportNavigationPermissionsForTypes = false`; `EnableSecurityForActions = true`.
- The navigation group that would have held Users/Roles ("Default") is **removed**, so there is currently **no UI to manage users or roles**; only the header's **My Details** (own profile) exists.
- Header shows **My Details** and **Log Off**.

### 7.2 MERN implementation

- Collections `users` (`userName` Uniq, `passwordHash`, `isActive`, `changePasswordOnFirstLogon`, `roleIds[]`, `lastLoginAt`) and `roles` (`name` Uniq, `isAdministrative`, `permissions[]`).
- Permission model (mirrors XAF type permissions): per entity type, operations `read | create | write | delete | navigate`, allow/deny. `isAdministrative` bypasses all checks. Enforce on the **server** for every endpoint; hide menu items and buttons on the client accordingly.
- Seed **Administrators** (administrative) and **Default** (own profile only, exactly as in XAF), plus users **Admin** and **User**.
- **APPLY:** seeded users get `changePasswordOnFirstLogon = true` and an initial password from env (`SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD`); empty passwords are not allowed.
- **APPLY:** add **Administration → Users** and **Administration → Roles** screens (admins only): list, create, edit, deactivate users, assign roles, reset password; edit role permissions in a matrix (entity × operation).
- **My Details** (header link): own user name (read-only), change password (current + new + confirm).
- **Log Off** (header link): ends the session, returns to login.
- **Login page:** title "Log In"; text "Welcome! Please enter your user name and password below."; fields "User Name", "Password"; button "Log In". Generic error on failure ("Invalid user name or password."). Rate-limit login attempts.
- Idle timeout 10 minutes → redirect to login, then back to the page the user was on.

---

## 8. Audit Trail

XAF's Audit Trail module is active and has recorded 1,036 entries. Operation types seen: `ObjectCreated`, `InitialValueAssigned`, `ObjectChanged`, `ObjectDeleted`, `AddedToCollection`, `RemovedFromCollection`, `CollectionObjectChanged`. Each entry stores user name, timestamp, object, property, old value, new value.

MERN:
- `auditLogs` collection: `{ at, userId, userName, entity, entityId, entityDisplay, operation, property?, oldValue?, newValue?, parentEntity?, parentId? }`.
- Write entries in the same transaction as the change: one `ObjectCreated` + one `InitialValueAssigned` per non-empty field on create; one `ObjectChanged` per changed field on update; `ObjectDeleted` on delete; for child rows saved through a parent form also log `AddedToCollection` / `RemovedFromCollection` / `CollectionObjectChanged` on the parent.
- **APPLY:** add a **History** tab (read-only, newest first) on every record form for admins, and an **Administration → Audit Log** screen with filters (date range, user, entity, operation).

---

## 9. UI / UX — Application Shell & Shared Behaviour

### 9.1 Look and feel

The XAF app used the DevExpress **MaterialCompact** theme: white background, light grey navigation panel, **green** accent (selected menu item, current page number, toggles), compact grids, Material-style inputs with the caption **above** the field (model option `CaptionLocation = Top`), required fields marked with `*`.

**Decision:** keep this identity, modernised:
- Accent green `#2E7D32` (hover `#1B5E20`, light `#E8F5E9`); text `#1B2430`; secondary text `#5B6675`; borders `#D9E0E8`; page background `#FFFFFF`; nav background `#F5F7FA`.
- Error red `#B71C1C` on `#FFEBEE` (also used for out-of-range rows); warning amber `#8A5A00` on `#FFF4E5`; success green `#1B5E20` on `#E8F5E9`.
- Font: system UI stack or "IBM Plex Sans". Base size 14px; compact density.
- Captions above inputs; `*` after required captions; placeholders where §4 lists them; tooltips on hover of the caption (info icon).
- Booleans named Active are **toggle switches** everywhere (forms and grid cells).
- Must work at 1280px and above; usable on a tablet (≥ 768px: nav collapses to a drawer).

**Branding:** the XAF header logo was the stock DevExpress placeholder (`Images/Logo.svg`, and it rendered as a broken image). Create a simple "Aqua LIMS" wordmark with a water-drop icon. Browser title: `{screen caption} - Aqua LIMS`. Footer (right aligned, small): `Aqua LIMS` / `Version 1.0.0`.

**Icons:** reuse the PNG icons in `AquaLIMS.Module/Images/` (16×16 and 32×32): `BO_*.png` for each entity (shown next to screen titles and form titles) and `NAV_*.png` for navigation groups. Copy them into `client/public/icons/`. Status icons: Low = down chevron, OK = green diamond, High = up chevron (red), health Stable = green check circle, Warning = amber triangle, Critical = red cross circle.

### 9.2 Header

Left: logo. Right: **global search box** ("Text to search…", button "Search") that searches the current list screen's text columns; **My Details**; **Log Off**.

Removed in MERN (explicitly): notifications bell, theme switcher, "Quick create" menu (XAF tried to hide it with CSS; it is still visible but unwanted).

### 9.3 Navigation (left panel, collapsible, tree with icons)

Final effective XAF navigation, in display order (groups are alphabetical in XAF):

| Group (icon) | Items → screen |
|---|---|
| ~~KPI~~ (Definition, Scorecard) | **OUT OF SCOPE** |
| ~~Reports~~ | **OUT OF SCOPE** |
| **Sampling** (`NAV_Sampling`) | Sample → Sample list · Sample Parameter → Sample Parameter list |
| **Species** (`NAV_Species`) | Species Parameter Limit → Species Parameter Limit list |
| **Tank Readings** (`NAV_TankReadings`) | Tank Reading → list · Tank Reading Parameter → list |
| **Tanks** (`NAV_Tanks`) | Tank → list · Tank Parameter Override → list · Tank Species → list |
| **Utils** (`NAV_Utils`) | **Aquatic Environments** → list; **Measurements** (`NAV_Measurements`): Measurement Types, Units; **Water Quality** (`NAV_WaterQuality`): Categories, Parameters; **Supplies** (`NAV_Supplies`): Water Sources, Treatment Types; **Inhabitants** (`NAV_Inhabitants`): Species Groups, Species |
| **Water Management** (`NAV_WaterManagement`) | Water Preparations → list · Water Change Logs → list |
| **Administration** (new, admins only) | Users · Roles · Audit Log |

Water Prep Source / Treatment / Reading have list screens in XAF but **no navigation entry**; they are reached only inside the Water Preparation form. Provide their routes (for deep links) but no menu items.

**Decision:** add **Home** at the top (§10.0) and make it the start page. (XAF opened the KPI Definition list, which is empty.)

The selected item is highlighted in the accent colour. Group expand/collapse state is remembered per user.

### 9.4 List screens (root lists)

Every list screen has:

1. **Title** row: entity icon + caption (e.g. "Tank").
2. **Description banner** directly under the title: the entity's banner text from §4 in a light strip (XAF CSS: `padding: 4px 16px 8px; font-size: 12px; color: #555; background: #f4f7fb; border-bottom: 1px solid #dde3ec`). Root lists only, never inside forms.
3. **Toolbar:** **New**, **Delete** (enabled when rows are selected; confirm "You are about to delete the selected record(s). Do you want to proceed?"), **Refresh**, **Export to** (CSV, XLSX, PDF — **Decision**: XAF also offered HTML, Image, MHT, Text, RTF, XLS, DOCX; those are dropped). XAF's toolbar **Edit** button is hidden/disabled (editing is per row) — do not show it. "Reset View Settings" is hidden in XAF — instead provide **Reset layout** inside the column menu.
4. **Grid:**
   - Selection checkbox column + a row **edit** icon column.
   - Clicking the edit icon **or double-clicking** a row opens the record in a **modal form** in edit mode (§9.5).
   - Sort by clicking headers (multi-sort with Shift); default sort = the entity's display-name field ascending, except where §10 says otherwise.
   - Per-column filter icon (operators: Begins with, Contains, Doesn't contain, Ends with, Equals, Doesn't equal, <, ≤, >, ≥), **Filter Row** toggle, **Search Panel**, **Group Panel** (group by a column, expand/collapse all), **Column Chooser** (show/hide), column resize and reorder, optional **Footer** with counts.
   - Paging: "Page X of Y (N items)", page sizes **10, 20 (default), 50, 100, 200**.
   - Computed columns (Health, Limit, Status, Prepared Amount, Added/Removed Water) are sortable/filterable where feasible; at minimum display them.
5. **Per-user view settings (APPLY as persistence of XAF behaviour):** XAF stored each user's column widths, order, visibility, sorting, grouping, filters and page size in the database. Save these per user per screen in `userViewSettings`, restore on load, and offer **Reset layout**.

### 9.5 Record forms (modal)

- **New** on a root list opens a **modal** form for a new record. **Save/OK** commits (parent + all nested rows in one transaction), closes the modal and refreshes the list. **Cancel** discards everything.
- Opening an existing record (edit icon / double-click) opens the same modal **already in edit mode**.
- Modal title: `{record display name} - {form caption}` (e.g. "Betta splendens - Species", "WC-202610-001 - Water Change Log"); for a new record with no name yet, just the form caption.
- **Modal sizing:** fits its content height, grows when content grows (validation messages, new grid rows, switching tabs), capped at the window height with internal scrolling; resizable and maximizable. (XAF needed a custom script for this; make it native.)
- Every modal record also has a route (`/tanks/:id`) so it can be opened directly; opening that URL shows the list with the modal open.
- Lookups (reference dropdowns): searchable dropdown; small **clear** (×) button; small **new** (+) button that opens a nested modal to create the referenced record and selects it on save (XAF showed these two buttons beside lookups). Empty lookup shows the placeholder or "Select…" (XAF showed "N/A").
- Warn on closing with unsaved changes.
- Read-only fields render as plain text, not disabled inputs.

### 9.6 Nested grids (child collections inside a form)

XAF edited **every** nested collection inside forms in **batch mode**: cells are edited inline; **New** adds an empty row at the top; edited/new cells are highlighted until saved; everything is saved with the parent's OK; Cancel discards. XAF also showed a second "Save changes / Cancel changes" bar under each nested grid, which confused users.

MERN rules:
- **APPLY:** inline editing, **single save** (the form's Save). No per-grid save bar anywhere.
- Toolbar on nested grids: **New** (adds row), **Delete** (selected rows), **Export to**. No Edit, Link, Unlink.
- Unsaved rows show computed columns live (Limit, Status, red highlight).
- Validation errors appear on the offending cell with a tooltip and a summary line under the grid.
- Nested grids for children that themselves have children (**Tank → Samples**, **Tank → Tank Readings**, **Water Change → Tank Readings**) are **read-only lists** in MERN with **New** (opens the child's full form in a nested modal, with the parent pre-filled) and row open. (APPLY: inline batch-editing a sample row could not edit its results.)
- Empty nested grid shows a friendly message instead of "No data to display" (Species gives the exact text in §10.6).

**Out-of-range row highlight (Conditional Appearance):** in **Sample Parameter** and **Tank Reading Parameter** grids — both the root lists and the nested grids — every row whose `resultStatus` is Low or High has background `rgb(255,235,238)` (`#FFEBEE`) and text `rgb(183,28,28)` (`#B71C1C`) on **all** cells. This is list-only (not applied on the single-record form).

### 9.7 Shared lookup behaviour

| Lookup | Shows | Filter | Notes |
|---|---|---|---|
| Category | categoryName | **Active only** | |
| Measurement Type | measurementTypeName | **Active only** | |
| Unit (everywhere) | dropdown columns: **Unit Symbol**, Unit Name; selected value shows the **symbol** where §10 says so, otherwise the name | **Active only** | Sorted by **sortOrder** then name |
| Aquatic Environment | environment | **Active only** | Inline new/edit/delete/unlink hidden in its lookup list |
| Parameter.defaultUnit | unitSymbol, with search | Active only | |
| Species (in Tank Species) | **commonName** | none | |
| Tank (in Water Change) | tankName | none | Simple dropdown of all tanks |
| All others | display name (§4) | none | |

**PRESERVE:** only the four lookups above filter by Active. Species, Parameter, Tank, Species Group, Treatment Type, Water Source, Water Preparation lookups list inactive records too. **Decision (APPLY, soft):** show inactive records in those lookups with a muted "(inactive)" suffix, so the behaviour is preserved but visible.

---

## 10. Screen-by-Screen Specification

Columns below are the **real columns of the running XAF app**, in order. "Form layout" describes the **intended** layout; where XAF's layout was broken (noted), build the intended one.

### 10.0 Home (new, APPLY)

A start page replacing the empty KPI screen:
- **Tank health cards**: one card per active tank with name, code, health level icon + label, and health detail text; click opens the tank.
- **Out-of-range results**: latest 10 Sample/Tank Reading results with status Low/High (tank, parameter, value, limit, date).
- **Recent water changes**: latest 5 with code, tank, status, and a red badge if an override note was used.
- **Quick actions**: New Sample, New Tank Reading, New Water Preparation, New Water Change.

### 10.1 Tank

**List** (`/tanks`): Tank Code · Tank Name · Source (environment) · Volume (n2) · Health (icon + label) · Health Detail. Default sort Tank Name.

**Form** — caption "Tank":
- Section **Tank**: Row 1: Tank Name*, Tank Code*. Row 2: Volume, Active (toggle), Source. Row 3: **Health** (icon + label, read-only) and **Health Detail** (read-only text).
  - **APPLY (bug fix):** XAF merged two layout layers badly and shows Tank Name, Tank Code, Volume and Source **twice** on this form. Show each once.
- **Notes** (multi-line).
- Tabs:
  1. **Tank Species** — inline grid: Species (by common name), Notes, Active.
  2. **Parameter Overrides** — inline grid: Parameter, LCL, UCL, Notes. Show next to it (read-only) the **effective limits** table for the tank: Parameter, LCL, UCL, Source (§5.1) — **APPLY** (helps users see what overrides change).
  3. **Samples** — read-only list: Sample Code, Collected Date, Volume, Volume Unit, Status; New/open per §9.6.
  4. **Tank Readings** — read-only list: Reading Date, Context, Water Change; New/open per §9.6.
- Created/Last Updated are hidden on this form.

### 10.2 Tank Species (root list)

**List** (`/tank-species`): Tank · Species (common name) · Notes · Active.
**Form**: Species (common-name lookup), Active (toggle) on one row; Notes below.

### 10.3 Tank Parameter Override (root list)

**List** (`/tank-parameter-overrides`): Tank · Parameter · LCL · UCL.
**Form**: Tank, Parameter, LCL, UCL, Notes. (Hide Created/Last Updated — APPLY.)

### 10.4 Sample

**List** (`/samples`): Sample Code · Tank · Collected Date · Volume · Volume Unit · Status. Default sort Sample Code.

**Form** — caption "Sample":
- Sample Code*, Tank*, Collected Date, Volume, Volume Unit (unit lookup), Status, Active.
- Notes.
- **Sample Parameters** inline grid: Parameter · Measured Value · Unit · Limit (computed) · Status (computed icon + text) · Tested Date. Red rows for Low/High. Unit auto-fills from the parameter's default unit when empty (§5.6).
- Live limits require the Tank to be selected; if not, Limit is empty and Status shows "No limit".

### 10.5 Sample Parameter (root list)

**List** (`/sample-parameters`): Sample · Parameter · Measured Value · Unit · Limit · Status · Tested Date (red rows for Low/High).
**Form**: Sample*, Parameter*, Measured Value*, Unit, Limit (read-only), Status (read-only), Tested Date, Notes.

### 10.6 Species (current, redesigned layout — build this)

**List** (`/species`): Species Name · Common Name · Species Group · Description. Default sort Species Name.

**Form** — caption "Species":
- Section **Species Details**:
  - Row 1: **Species Name*** (placeholder "e.g. Oncorhynchus mykiss", tooltip "Scientific (Latin) name of the species") · **Common Name** (placeholder "e.g. Rainbow trout", tooltip "Everyday name shown on reports") · **Active** (toggle). Widths ≈ 42% / 42% / 16%.
  - Row 2: left column stacked **Species Group** (placeholder "Select a group (optional)") and **Last Updated On** (read-only date); right column **Description** (2 rows, placeholder "Optional notes about this species"). Widths ≈ 42% / 58%.
- Section **Parameter Limits** (no caption on the grid itself):
  - Toolbar: **Add Parameter** (the New action, renamed for this grid), **Copy from Species** (§5.8, tooltip "Copy parameter limits from another species"), Delete, Export to.
  - Inline grid columns: **Parameter** (180px) · **Unit** (symbol, 80px) · **LCL** (90px) · **Ideal** (90px) · **UCL** (90px). Active column hidden.
  - Empty text: **"No parameter limits yet. Click Add Parameter, or Copy from Species to start from a similar species."**
  - No per-grid save bar (single save).
- **OPTIONAL** (from the approved design concept): a small range bar per row showing LCL–UCL with a marker at Ideal.

### 10.7 Species Parameter Limit (root list, under "Species")

**List** (`/species-parameter-limits`): Species · Parameter · LCL · UCL · Ideal · Unit.
**Form** — caption "Species Parameter Limit": Row: Parameter, Ideal; Row: Unit (symbol lookup), LCL, UCL; Notes (4 rows). (Hide Created/Last Updated.)

### 10.8 Species Group

**List** (`/species-groups`): Group Name · Description.
**Form**: Group Name*, Description, Active. (XAF showed editable Created/Last Updated here — APPLY: hide.)

### 10.9 Tank Reading

**List** (`/tank-readings`): Reading Date · Tank · Context · Water Change. **Decision:** default sort Reading Date descending.

**Form** — title `{tank} {readingDate:d}`:
- Tank*, Reading Date, Context (default Routine), Water Change (optional lookup of water changes by code), Active.
- Notes.
- **Parameters** inline grid: Parameter · Measured Value · Unit · Limit (computed) · Status (computed). Red rows for Low/High.
- (XAF showed editable Created Date / Last Updated Date here — APPLY: hide.)

### 10.10 Tank Reading Parameter (root list)

**List** (`/tank-reading-parameters`): Tank Reading · Parameter · Measured Value · Unit · Limit · Status (red rows).
**Form**: Tank Reading*, Parameter*, Measured Value*, Unit, Limit, Status, Notes.

### 10.11 Parameter

**List** (`/parameters`, caption "Parameters"): Parameter Name (258px) · Parameter Code (125px) · Category (112px) · Default Unit (symbol, 77px). Sort Order hidden.

**Form**: Row: Parameter Name*, Parameter Code*. Row: Category*, Default Unit (symbol lookup with search), Active, Sort Order. **Description** (large multi-line) below.

### 10.12 Category

**List** (`/categories`, caption "Categories"): Category Name · Description · Active.
**Form**: Row: Category Name* (≈75%), Active (≈25%). Description (2 rows).

### 10.13 Unit

**List** (`/units`, caption "Units"): Unit Name (175px) · Unit Symbol · Measurement Type (109px) · Description (194px). **Sorted by Sort Order** (hidden column) by default.

**Form** — section "Unit": Row: Unit Name*, Unit Symbol*; Row: Sort Order, Active; Measurement Type; Description (2 rows).

### 10.14 Measurement Type

**List** (`/measurement-types`, caption "Measurement Types"): Measurement Type. (XAF allowed inline editing in this list — **Decision:** use the standard modal form.)
**Form**: Measurement Type*, Active on one row.

### 10.15 Aquatic Environment

**List** (`/aquatic-environments`, caption "Aquatic Environments"): Environment · Description (200px) · Active (45px). (XAF used inline row editing here — **Decision:** modal form for consistency.)
**Form**: Row: Environment* (≈42%), Active (≈58%). Description (3 rows).

### 10.16 Water Source

**List** (`/water-sources`, caption "Water Sources"): Source · Description.
**Form**: Water Source*, Description (3 rows) in the left ~58% column.

### 10.17 Treatment Type

**List** (`/treatment-types`, caption "Treatment Types"): Treatment Type · Description. Filter Row shown by default.
**Form**: Row: Treatment Type* (≈72%), Active (≈28%). Description (2 rows).

### 10.18 Water Preparation

**List** (`/water-preparations`, menu caption "Water Preparations", screen caption "Water Preparation"): Prep Code (70) · Prepared Date (70, **default sort descending**) · Prepared Amount (e.g. "2.00 (L)") · Notes (201) · Status.

**Form** — caption "Water Preparation":
- Prep Code (read-only; preview then final, §5.5), Prepared Date, Prepared Volume, Volume Unit (mL/L/gal), Status.
- Notes.
- Tabs or stacked sections:
  1. **Sources** — inline grid: Source (water source name) · Volume · Volume Unit (default mL).
  2. **Treatments** — inline grid: Treatment Type · Amount Used · Amount Unit (symbol) · Applied Date (default now).
  3. **Readings** — inline grid: Parameter · Measured Value · Unit · Reading Date (default now). Unit auto-fills when empty (§5.6).
- **APPLY (soft):** show "Total from sources" (sum of source volumes converted to the batch unit: 1 L = 1000 mL, 1 gal = 3.785 L) next to Prepared Volume as a hint only; never auto-change the value.

### 10.19 Water Change Log

**List** (`/water-changes`, caption "Water Change Logs"): Change Code (115) · Tank · Water Preparation (136) · Added Water · Removed Water · Change Date (113) · Notes · Status. **Decision:** default sort Change Date descending.

**Form** — caption "Water Change Log", focus starts on Tank:
- Left column: **Change Code*** (read-only), **Tank*** (dropdown), **Prepared Water*** (water preparation lookup by prep code; **Decision:** show status next to each option and list Ready/Partially Used batches first), **Change Date**, **Status**.
- Right column: **Removed Water** [number] [unit mL/L/gal], **Added Water** [number] [unit]. (APPLY bug fix: XAF shows an extra stray "Added Water" caption.)
- **Override Note** (2 rows). Visually emphasised (red border + helper text) when critical alerts exist.
- **Notes**.
- **Alert Summary** (read-only, live, §5.3).
- **Tank Readings** — read-only list of readings linked to this change: Reading Date · Tank · Context; New opens a Tank Reading form pre-filled with this tank, this water change and context "Before Water Change" (**Decision**).
- Save is blocked by §6.3 with the message on the Override Note field.

### 10.20 Water Prep Source / Treatment / Reading (no menu; routes only)

- `/water-prep-sources`: Water Preparation · Source · Volume · Volume Unit. Form: Source*, Volume*, Volume Unit.
- `/water-prep-treatments`: Treatment Type · Amount Used · Amount Unit · Applied Date · Water Preparation. Form: row Treatment Type*, Amount Used, Amount Unit, Applied Date; Notes.
- `/water-prep-readings`: Water Preparation · Parameter · Measured Value · Unit · Reading Date. Form: Water Preparation, Parameter*, Measured Value*, Unit, Reading Date, Notes.

### 10.21 Administration (new)

Users, Roles, Audit Log — §7.2 and §8.

---

## 11. API Design

Base path `/api`. JSON. Auth required except `/api/auth/login`. All list endpoints support `?page=&pageSize=&sort=field:asc,field2:desc&q=&filter[field][op]=value&includeInactive=`.

**Generic per resource** (`categories`, `measurement-types`, `units`, `parameters`, `aquatic-environments`, `water-sources`, `treatment-types`, `species-groups`, `species`, `species-parameter-limits`, `tanks`, `tank-species`, `tank-parameter-overrides`, `samples`, `sample-parameters`, `tank-readings`, `tank-reading-parameters`, `water-preparations`, `water-prep-sources`, `water-prep-treatments`, `water-prep-readings`, `water-changes`):

| Method | Path | Notes |
|---|---|---|
| GET | `/{resource}` | Paged list with display names of references and computed columns resolved. |
| GET | `/{resource}/:id` | Record + nested children for parents (species → limits; tank → tankSpecies, overrides, effectiveLimits, health; sample → parameters with limit/status; tank reading → parameters; water preparation → sources, treatments, readings; water change → readings, alertSummary, alerts). |
| POST | `/{resource}` | Create. Parents accept nested `children` arrays and save in one transaction. |
| PUT | `/{resource}/:id` | Update. Nested arrays are a full replacement set: rows with `_id` update, rows without `_id` create, missing rows soft-delete. |
| DELETE | `/{resource}/:id` | Soft delete with the rules in §4.7. Bulk: `POST /{resource}/bulk-delete { ids }`. |
| GET | `/{resource}/export?format=csv|xlsx|pdf` | Honors the same filters/sort/visible columns. |

**Domain endpoints**

| Method | Path | Returns |
|---|---|---|
| GET | `/tanks/:id/effective-limits` | `[{ parameterCode, parameterName, lcl, ucl, source }]` (§5.1) |
| GET | `/tanks/:id/health` | `{ level, summary }` (§5.4) |
| POST | `/limits/evaluate` | Body `{ tankId, rows: [{ parameterId, measuredValue }] }` → `[{ limitRange, resultStatus }]` for unsaved grid rows |
| GET | `/water-changes/check?tankId=&waterPreparationId=&overrideNote=` | `{ alerts, criticalCount, borderlineCount, requiresOverride, summaryText }` (§5.3) |
| GET | `/water-preparations/next-code`, `/water-changes/next-code` | Preview code (§5.5) |
| GET | `/species/:id/copy-sources` | Species with ≥1 limit, excluding `:id` (use `new` for an unsaved species) |
| GET | `/species/:id/limits` | Limits of a source species for the copy dialog |
| GET | `/lookups/{resource}?q=&activeOnly=` | Light `{ _id, label, extra }` lists for dropdowns, sorted per §9.7 |
| GET | `/home` | Data for §10.0 |
| POST | `/auth/login`, `/auth/logout`, `/auth/change-password`; GET `/auth/me` | Session |
| CRUD | `/admin/users`, `/admin/roles`; GET `/admin/audit-logs` | Admin only |
| GET/PUT/DELETE | `/me/view-settings/:viewKey` | Per-user grid layout (§9.4) |

---

## 12. Mongo Collections & Indexes

`users`, `roles`, `auditLogs`, `userViewSettings`, `counters`, `measurementTypes`, `units`, `categories`, `parameters`, `aquaticEnvironments`, `waterSources`, `treatmentTypes`, `speciesGroups`, `species`, `speciesParameterLimits`, `tanks`, `tankSpecies`, `tankParameterOverrides`, `samples`, `sampleParameters`, `tankReadings`, `tankReadingParameters`, `waterPreparations`, `waterPrepSources`, `waterPrepTreatments`, `waterPrepReadings`, `waterChanges`.

Indexes: every unique field in §6.2 (case-insensitive collation, partial on `deletedAt: null`); every foreign key; `tankReadings { tankId: 1, readingDate: -1 }`; `sampleParameters { sampleId: 1 }`; `samples { tankId: 1 }`; `waterChanges { changeDate: -1 }`; `waterPreparations { preparedDate: -1 }`; `auditLogs { entity: 1, entityId: 1, at: -1 }` and `{ at: -1 }`; compound unique `speciesParameterLimits { speciesId, parameterId }` and `tankParameterOverrides { tankId, parameterId }` (partial, non-deleted).

---

## 13. Seed Data (current production reference data)

Seed exactly this. `active = true` unless stated.

**Measurement Types:** Concentration, Hardness, Mass, pH, Temperature, Volume.

**Units** (name · symbol · measurement type · sort order · description · active):

| Unit | Symbol | Type | Sort | Description | Active |
|---|---|---|---|---|---|
| pH | pH | pH | 1 | Measures hydrogen ion concentration; scale 0–14. | ✓ |
| Litre | L | Volume | 1 | Standard metric volume unit for tank capacity, water prep batches, and sample collection | ✓ |
| Gram | g | Mass | 1 | Standard unit for measuring dry treatment products such as salts and mineral supplements | ✓ |
| Celsius | °C | Temperature | 1 | Standard metric temperature unit used in most aquarium equipment and scientific references | ✓ |
| Parts Per Million | ppm | Concentration | 1 | Mass of solute per million parts of solution by weight; standard unit for NH₃, NO₂, NO₃, TDS | ✓ |
| Degrees of General Hardness | dGH | Hardness | 1 | Measures total dissolved calcium and magnesium; 1 dGH = 17.9 ppm CaCO₃ | ✓ |
| Fahrenheit | °F | Temperature | 2 | Imperial temperature unit; used in some US equipment readings | ✗ |
| Degrees of Carbonate Hardness | dKH | Hardness | 2 | Measures bicarbonate and carbonate ions; indicates buffering capacity and pH stability | ✓ |
| Milligram | mg | Mass | 2 | Used for very small treatment doses and medication calculations | ✓ |
| Millilitre | mL | Volume | 2 | Used for small sample volumes and precise treatment dosing | ✓ |
| Milligrams per Litre | mg/L | Concentration | 2 | Equivalent to ppm in dilute aqueous solutions; used in lab reports and scientific documentation | ✓ |
| Gallon (US) | gal | Volume | 3 | Imperial volume unit; 1 US gal = 3.785 L; used on some equipment and product labels | ✗ |
| Parts Per Billion | ppb | Concentration | 3 | Used for trace element testing such as copper, iron, and phosphate at very low levels | ✓ |

**Categories:**

| Category | Description |
|---|---|
| Disease & Treatment | Parameters monitored during medication or disease outbreak; copper levels, salt concentration |
| Dissolved Solids | Total dissolved solids and conductivity measurements indicating overall mineral load |
| Hardness | Calcium, magnesium, and carbonate levels affecting pH stability and livestock health |
| Nitrogen Cycle | Parameters tracking the biological nitrogen cycle; ammonia, nitrite, and nitrate produced by livestock waste |
| Physical | Non-chemical properties such as temperature, turbidity, and salinity |
| Trace Elements | Minerals required in small quantities; iron, copper, iodine, and similar micronutrients |
| Water Chemistry | Core chemical properties of water including pH and carbon dioxide |

**Parameters** (all sort order 0):

| Name | Code | Category | Default Unit | Description |
|---|---|---|---|---|
| Ammonia | NH3 | Nitrogen Cycle | ppm | Toxic waste produced by livestock and decaying organic matter. |
| General Hardness | GH | Hardness | dGH | Measures dissolved calcium and magnesium affecting livestock osmoregulation. |
| Iron | Fe | Trace Elements | ppm | Essential micronutrient required for healthy aquatic plant growth |
| Nitrate | NO3 | Nitrogen Cycle | ppm | End product of the nitrogen cycle, controlled via regular water changes. |
| Carbonate Hardness | KH | Hardness | dKH | Buffering capacity that stabilizes water against pH crashes. |
| Chlorine | Cl2 | Water Chemistry | ppm | Disinfectant found in tap water that is toxic to beneficial bacteria and livestock (migrate full text from SQL) |
| pH | pH | Water Chemistry | pH | — |
| Temperature | Temp | Physical | °C | — |
| Carbon Dioxide | CO2 | Water Chemistry | ppm | Dissolved gas level critical for plant growth and livestock respiration |
| Total Dissolved Solids | TDS | Dissolved Solids | ppm | — |
| Copper | Cu | Disease & Treatment | ppm | Active element in medications, lethal to invertebrates at low levels. |
| Nitrite | NO2 | Nitrogen Cycle | ppm | Intermediate nitrogen cycle byproduct highly toxic to aquatic life |

**Aquatic Environments:** Brackish — "A mix of fresh water and salt water, mimicking coastal environments where rivers meet the sea." (active: **null in SQL → treat as false**); Freshwater — "Contains zero to trace amounts of dissolved salts. Mimics natural inland water bodies such as river." (active); Marine — "Fully ocean-like water conditions with high concentrations of dissolved salts (~35 ppt)." (active: null → false).

**Water Sources** (name — description): Borehole / Well Water — Groundwater pumped on-site. Mineral composition varies by location; requires baseline testing before use. · Dechlorinated Tap Water — Tap water treated to neutralise chlorine and chloramine. Most common direct-use freshwater source in hobby and facility settings. · Deionised (DI) Water — Ion exchange removes dissolved ions. Lab-grade purity for water preparation and reagent mixing. · Distilled Water — Heat-vaporised and condensed water. Removes most impurities. Used in labs and as a substitute for RO where RO units are unavailable. · Natural Seawater — Collected ocean water. Used in marine facilities for direct top-up or as a culture medium. Requires pathogen screening before use. · Packaged Drinking Water — Purified and packaged drinking water treated through filtration and disinfection processes. Contains a controlled level of dissolved minerals · Rainwater — Collected surface water. Naturally soft and low TDS but may carry contaminants. Used in planted and biotope tanks. · RO Water — Reverse osmosis filtered water. Removes ~95-99% of dissolved solids. Standard starting point for freshwater and marine tanks. · RO/DI Water — Reverse osmosis followed by deionisation. Near-zero TDS. Used where maximum purity is required (marine, sensitive species, lab prep). · Spring Water — Naturally mineralised water from a spring source. Used as a quality freshwater option where RO is unavailable. · Tap Water — Untreated municipal supply. Requires dechlorination before aquatic use. Baseline source in most facilities.

**Treatment Types:** Bacterial Boosting — Cycle support & waste reduction · Clarifying — Fixes cloudy water · Dechlorination — Removes chlorine and chloramine from tap water · Demineralisation — Removes dissolved minerals and salts from water · Fertilization — Feeds plants or corals · Medication — Eradicates disease & parasites · Mineralisation — Adds essential minerals and trace elements to purified water · pH Adjustment — Raises or lowers pH to reach the target level · Salinity Adjustment — Adjusts salt concentration for marine or brackish systems.

**Species Groups:** Betta — Labyrinth fish; males are territorial and cannot be housed together · Corydoras — Armoured bottom-dwelling catfish; peaceful scavengers best kept in groups of six or more · Dario — Freshwater micro-predators with vibrant male coloration; all share micro-live-food requirements and micro-territorial behavior. · Neocaridina — Freshwater dwarf shrimp with many colour morphs; all share identical water parameters.

**Species:**

| Species Name | Common Name | Group | Description | Active |
|---|---|---|---|---|
| Betta splendens | Betta | Betta | Vibrant labyrinth fish; requires warm still water | ✗ |
| Corydoras aeneus | Green Bronze Cory | Corydoras | Metallic green-bronze sheen; one of the hardiest and most adaptable corys | ✓ |
| Corydoras aeneus (Albino) | Albino Cory | Corydoras | Captive-bred albino form of Bronze Cory; very hardy and peaceful bottom dweller | ✓ |
| Corydoras trilineatus | Leopard Cory | Corydoras | Spotted pattern resembling a leopard; often confused with Julii Cory | ✓ |
| Dario dario | Scarlet Badis | Dario | Compact nano badis with vibrant red bars; requires live micro-foods and plants. | ✓ |
| Neocaridina davidi | Cherry Shrimp | Neocaridina | Dwarf shrimp in red, blue and black morphs; all variants share identical water parameters | ✓ |

**Species Parameter Limits** (species · code · LCL · Ideal · UCL · unit):

| Species | Limits |
|---|---|
| Betta splendens | pH 6–7–8 pH · TDS 100–200–300 ppm · Temp 22–26–30 °C |
| Corydoras aeneus | pH 6–7–8 pH · Temp 22–26–30 °C |
| Corydoras aeneus (Albino) | pH 6–7–8 pH · Temp 22–26–30 °C |
| Corydoras trilineatus | pH 6–7–8 pH · TDS 100–200–300 ppm · Temp 22–26–30 °C |
| Dario dario | Cl2 0–0–0 ppm · GH 50–107–215 **ppm** · KH 35–71–143 **ppm** · NH3 0–0–0 ppm · NO2 0–0–0 ppm · NO3 0–10–20 ppm · pH 6.5–7–7.5 pH · TDS 100–150–250 ppm · Temp 20–23–26 °C |
| Neocaridina davidi | Cl2 0–0–0 ppm · NH3 0–0–0 ppm · NO2 0–0–0 ppm · NO3 0–10–20 ppm · pH 6–7–8 pH · TDS 100–200–300 ppm · Temp 22–26–30 °C |

(Format is LCL–Ideal–UCL.)

**Tanks:** T001 "River Setup Tank", volume 20, Freshwater, notes "A basic river tank with shrimps and corys." · T002 "Nano Tank", volume 13, Freshwater, notes "Low tech nano tank".

**Tank Species:** T001 → Corydoras aeneus, Corydoras aeneus (Albino), Neocaridina davidi, Corydoras trilineatus. T002 → Dario dario.

**Tank Parameter Overrides:** T002 TDS 150–220 · T001 pH 6.0–7.5.

**Transactional demo data (for tests; migrate real data instead in production):**
- Water Preparation **WP-202608-001**: prepared 2026-08-19, volume 2 L, status **Used**, notes "Emergency preparation to reduce the sudden TDS spike". Source: Packaged Drinking Water 2 L. Treatment: Dechlorination 0.5 mL applied 2026-08-19 17:20. Reading: TDS 57 (no unit → falls back to ppm) on 2026-08-19 23:18.
- Sample **01**: tank T001, collected 2026-10-14 11:53, volume 100, status Pending. Result: pH 6.5 tested 2026-10-14 11:53.

**Users:** Admin (Administrators), User (Default) — passwords per §7.2.

---

## 14. Data Migration (SQL Server → MongoDB)

Write `scripts/migrate-from-sqlserver.ts` using the `mssql` package. Connection from env (`SQLSERVER_CONNECTION`, e.g. server `(local)\SQL2022`, database `AquaLIMS`, integrated security on Windows).

**Table facts:**
- Every class has a table named after the class; columns are named after properties; references are columns holding the target's `Oid` (GUID), named after the property (e.g. `SpeciesParameterLimit.Species`, `.Parameter`, `.Unit`).
- Classes derived from `AquaBaseObject` store **Active, CreatedDate, LastUpdatedDate, GCRecord, OptimisticLockField** in the **`AquaBaseObject`** table, joined by `Oid`. Their own tables hold only their own fields.
- `BaseObject`-only classes (AquaticEnvironment, WaterSource, WaterPreparation, WaterPrepSource, WaterPrepTreatment, WaterChange) have `GCRecord` in their own table.
- **Skip soft-deleted rows:** `GCRecord IS NOT NULL` (6 such rows exist in `AquaBaseObject`).
- Enums are integers — map with §4.1.
- `AquaticEnvironment.Active` can be **NULL** → migrate as `false`.
- Decimals are 4-dp → keep as numbers.
- Keep each GUID as `legacyOid` and build an Oid → ObjectId map for references.
- Migrate `PermissionPolicyUser` (user names, `IsActive`; **do not** migrate password hashes — force a reset with `changePasswordOnFirstLogon = true`), `PermissionPolicyRole`, the user–role link table `PermissionPolicyUserUsers_PermissionPolicyRoleRoles`, and the permission tables into the MERN permission model.
- Migrate `AuditDataItemPersistent` into `auditLogs` (map `OperationType`, `PropertyName`, `ModifiedOn`, `UserName`, old/new values; resolve the audited object via `AuditedObjectWeakReference`/`XPWeakReference`).
- Initialise `counters` from the highest WP/WC code per month.

**Ignore:** `Genus`, `Source`, `SpeciesType` (legacy tables with no class in the code); `WaterPrepTreatmentTreatments_WaterPreparationWaterPreparations` (stale many-to-many table; the real link is `WaterPrepTreatment.WaterPreparation`); `XPObjectType`, `XPWeakReference` (except for audit resolution); `ModelDifference*` (XAF per-user UI layouts — not portable); KPI/Dashboard/Scheduler/Workflow tables (empty).

**Orphans:** one `WaterPrepTreatment` row has `WaterPreparation = NULL` (Dechlorination 0.5 mL, 2026-08-19 10:24). Report orphans in the migration log and skip them.

Produce a migration report: counts per collection, skipped rows with reasons.

---

## 15. Acceptance Tests (must pass)

Use the seed data from §13.

**Effective limits**
1. T001 effective limits = pH 6.00–7.50 (source "Tank override"), Temp 22.00–30.00, TDS 100.00–300.00, Cl2 0.00–0.00, NH3 0.00–0.00, NO2 0.00–0.00, NO3 0.00–20.00.
2. T002 effective limits = Cl2 0–0, GH 50–215, KH 35–143, NH3 0–0, NO2 0–0, NO3 0–20, pH 6.50–7.50 (source "Dario dario"), TDS 150.00–220.00 (source "Tank override"), Temp 20–26.
3. Two species with pH 6–8 and 6.5–7.5 in one tank (no override) → pH 6.50–7.50.
4. Parameter code match is case-insensitive (`ph` limit applies to `pH` result).

**Result status**
5. Sample 01 pH 6.5 on T001 → Limit "6.00 – 7.50", Status OK, no red row.
6. pH 5.99 on T001 → Low, red row. pH 7.51 → High, red row. pH 6.00 and 7.50 → OK (inclusive).
7. A parameter with no limit for the tank (e.g. Iron on T001) → Limit "", Status "No limit".

**Tank health**
8. T001 with only Sample 01 → **Stable**, "The latest result is within its limit."
9. T002 with no results → **No data**, "No results yet for the parameters that have limits."
10. A tank with no species and no overrides → No data, "No parameter limits set for this tank."
11. T001 latest pH 6.10 → **Warning**, "pH 6.10 near lower limit 6.00".
12. T001 latest Nitrate 18 → Warning, "Nitrate 18.00 near upper limit 20.00". Nitrate 1.00 → no warning (LCL 0 rule).
13. T001 latest Ammonia 0 → in range, no warning (zero-width limit).
14. T001 latest pH 5.90 and Nitrate 18 → **Critical**, "pH 5.90 low (limit 6.00 – 7.50); Nitrate 18.00 near upper limit 20.00".
15. Two pH results, older 5.0 and newer 7.0 → only 7.0 counts.
16. Latest is decided across Samples (testedDate) and Tank Readings (readingDate) together.
17. Two results: "All 2 latest results are within limits."

**Water change check**
18. WP-202608-001 vs T002 → one alert: TDS 57.00 ppm, limit 150.00 – 220.00, OUTOFRANGE, Source "Tank override". Summary text exactly:
    ```
    Parameter check — WP-202608-001 vs Nano Tank

      ✗  Total Dissolved Solids 57.00 ppm   limit: 150.00 – 220.00   [OUTOFRANGE]
           Source: Tank override

    1 critical issue(s) detected — an override note is required to save.
    ```
19. Same pair: save without override note → 422 with "Critical out-of-range parameters detected. Add an override note to acknowledge and proceed."; save with note "Emergency" → 201; the last summary line disappears once a note is typed.
20. WP-202608-001 vs T001 → TDS 57 vs 100–300 → OUTOFRANGE (buffer 10).
21. Borderline: pH 7.55 vs 6.00–7.50 → BORDERLINE (buffer = max(0.075, 0.1) = 0.1); saving needs no note. pH 7.65 → OUTOFRANGE.
22. No tank or no batch selected → "Select a tank and a prepared water batch to see the parameter comparison."; all readings in range → "✓ All checked parameters are within range for River Setup Tank."

**Codes**
23. First water preparation in October 2026 → WP-202610-001; next → WP-202610-002. Concurrent creates never duplicate.
24. Water change codes follow the same rules with `WC-`.

**Species form**
25. Picking Parameter "Temperature" on a new limit row fills Unit "°C".
26. Copy from Species: source list excludes the current species and species without limits; copying Betta's limits into a species that already has pH copies TDS and Temp, skips pH, toast "2 parameters copied, 1 skipped (already defined for this species). Review the values and Save."; nothing is saved until Save.
27. One Save stores the species and all limit rows; Cancel discards new rows.

**Validation & security**
28. Duplicate Species Name in different case → rejected (unique).
29. LCL 8 > UCL 6 → rejected.
30. Deleting a Unit used by a Parameter → blocked with a message.
31. User "User" (Default role) can log in, open My Details, change own password, and gets 403 on business endpoints; menu shows no business screens.
32. Session idle for 10 minutes → next request redirects to login.
33. Every create/update/delete writes audit entries with the user name.

**UI**
34. New Species form shows no red errors until Save is attempted.
35. Grid layout (column order, width, sort, page size) persists per user after reload; Reset layout restores defaults.
36. Export of the Tank list to XLSX includes the Health and Health Detail columns.

---

## 16. Known Quirks of the XAF App (summary of PRESERVE / APPLY)

| # | Quirk | Decision |
|---|---|---|
| 1 | Limits matched by parameter **code**, case-insensitive | PRESERVE |
| 2 | Inactive species / tank species / limits still count toward limits | PRESERVE |
| 3 | No unit conversion between results and limits; Dario dario GH/KH limits stored in ppm while parameters default to dGH/dKH | PRESERVE + soft warning icon |
| 4 | Result status is strict; water-change check uses a buffer (Borderline) | PRESERVE (two different functions) |
| 5 | Codes generated on New → can collide | APPLY atomic counters |
| 6 | Parameter code not unique | APPLY unique |
| 7 | No LCL ≤ UCL / duplicate-parameter rules | APPLY |
| 8 | Tank form shows Tank Name/Code/Volume/Source twice; Water Change form shows "Added Water" twice | APPLY fix |
| 9 | Editable Created/Last Updated dates on several forms | APPLY read-only/hidden |
| 10 | Alert Summary refreshes only after a round trip | APPLY live |
| 11 | Per-grid "Save changes / Cancel changes" bars | APPLY single save |
| 12 | Red required-field icons on a brand-new form | APPLY show on save |
| 13 | No UI for users/roles | APPLY admin screens |
| 14 | Seeded users have empty passwords | APPLY forced reset |
| 15 | Only Category / Measurement Type / Unit / Aquatic Environment lookups hide inactive records | PRESERVE + "(inactive)" label |
| 16 | `Sample.volumeUnit` is a Unit reference; other volumes use the mL/L/gal enum | PRESERVE |
| 17 | `TankReading.waterChange` context/tank consistency not enforced | PRESERVE + soft hint |
| 18 | Saving a water change does not touch the preparation | PRESERVE (do not invent logic) |
| 19 | App opens on the empty KPI screen | APPLY Home dashboard |
| 20 | Stock DevExpress logo (broken image) | APPLY Aqua LIMS wordmark |
| 21 | "Quick create", notifications bell, theme switcher in header | Remove |
| 22 | XAF iterated tank species in unspecified order (affects only the "Source" label on ties) | Order by createdAt |

---

## 17. Delivery Checklist

- [ ] Monorepo structure per §0, `docker-compose.yml` with a single-node replica set, `.env.example` files, `README.md` with setup, seed, migrate, test and run commands.
- [ ] All 22 domain entities + users, roles, audit logs, view settings, counters.
- [ ] Shared calculation module (§5) with unit tests reproducing §15 items 1–24.
- [ ] Validation (§6) on server and client.
- [ ] Security (§7), audit (§8).
- [ ] App shell (§9) and all screens (§10), including Home and Administration.
- [ ] API (§11) with API tests.
- [ ] Seed (§13) and migration (§14) scripts with a migration report.
- [ ] Playwright smoke test: log in → create tank with two species and an override → record a sample with an out-of-range result (red row, Critical health) → create a water preparation with a reading → create a water change that requires an override note → verify audit entries.
