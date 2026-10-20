// The one place every icon in the app comes from (Lucide line icons, one stroke width and size grid).
import {
  Activity,
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  ArrowUpNarrowWide,
  EyeOff,
  FilterX,
  PanelBottom,
  Beaker,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Columns3,
  Container,
  Copy,
  Diamond,
  Download,
  Droplet,
  Droplets,
  EllipsisVertical,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  Fish,
  FishSymbol,
  FlaskConical,
  Gauge,
  Group,
  History,
  House,
  Inbox,
  Info,
  KeyRound,
  Layers,
  LogIn,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Package,
  Pencil,
  Pipette,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Save,
  Scale,
  Search,
  SearchX,
  Sheet,
  ShieldCheck,
  SlidersHorizontal,
  SlidersVertical,
  Tags,
  TestTube,
  TestTubes,
  Trash2,
  TriangleAlert,
  Undo2,
  UserRound,
  Users,
  Waves,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { enumCaption, type ResultStatus, type TankHealthLevel } from '@aqualims/shared';

type IconProps = { size?: number; className?: string; title?: string };

const STROKE = 1.75;

function make(Component: LucideIcon) {
  return function AppIcon({ size = 16, className, title }: IconProps) {
    return (
      <Component
        size={size}
        strokeWidth={STROKE}
        className={`icon ${className ?? ''}`}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        role={title ? 'img' : undefined}
        focusable={false}
      />
    );
  };
}

// ─── Actions ────────────────────────────────────────────────────────────────
export const IconPlus = make(Plus);
export const IconTrash = make(Trash2);
export const IconRefresh = make(RefreshCw);
export const IconExport = make(Download);
export const IconEdit = make(Pencil);
export const IconSave = make(Save);
export const IconClose = make(X);
export const IconCancel = make(X);
export const IconCheck = make(Check);
export const IconCopy = make(Copy);
export const IconUndo = make(Undo2);
export const IconReset = make(RotateCcw);
export const IconMaximize = make(Maximize2);
export const IconRestore = make(Minimize2);
export const IconSearch = make(Search);
export const IconSearchOff = make(SearchX);
export const IconFilter = make(Filter);
export const IconFilterOff = make(FilterX);
export const IconSortAsc = make(ArrowUpNarrowWide);
export const IconSortDesc = make(ArrowDownWideNarrow);
export const IconSortClear = make(ArrowUpDown);
export const IconHide = make(EyeOff);
export const IconFooter = make(PanelBottom);
export const IconMenu = make(EllipsisVertical);
export const IconHamburger = make(Menu);
export const IconColumns = make(Columns3);
export const IconGroup = make(Group);
export const IconExpandAll = make(ChevronsUpDown);
export const IconCollapseAll = make(ChevronsDownUp);
export const IconLogIn = make(LogIn);
export const IconLogOut = make(LogOut);
export const IconUser = make(UserRound);
export const IconKey = make(KeyRound);
export const IconDetails = make(FileText);
export const IconHistory = make(History);
export const IconEmpty = make(Inbox);

// ─── Export formats ─────────────────────────────────────────────────────────
export const IconCsv = make(Sheet);
export const IconXlsx = make(FileSpreadsheet);
export const IconPdf = make(FileDown);

// ─── Navigation / direction ─────────────────────────────────────────────────
export const IconChevronDown = make(ChevronDown);
export const IconChevronUp = make(ChevronUp);
export const IconChevronLeft = make(ChevronLeft);
export const IconChevronRight = make(ChevronRight);
export const IconArrowUp = make(ArrowUp);
export const IconArrowDown = make(ArrowDown);
export const IconHome = make(House);
export const IconShield = make(ShieldCheck);

// ─── Feedback ───────────────────────────────────────────────────────────────
export const IconInfo = make(Info);
export const IconWarning = make(TriangleAlert);
export const IconError = make(CircleAlert);
export const IconSuccess = make(CircleCheck);

// ─── Record types and menu groups (keys are the registry's icon names) ──────
const ENTITY_ICONS: Record<string, LucideIcon> = {
  BO_MeasurementType: Scale,
  BO_Unit: Ruler,
  BO_Category: Tags,
  BO_Parameter: FlaskConical,
  BO_AquaticEnvironment: Waves,
  BO_WaterSource: Droplets,
  BO_TreatmentType: Pipette,
  BO_SpeciesGroup: Layers,
  BO_Species: Fish,
  BO_SpeciesParameterLimit: SlidersHorizontal,
  BO_Tank: Container,
  BO_TankSpecies: FishSymbol,
  BO_TankParameterOverride: SlidersVertical,
  BO_Sample: TestTube,
  BO_SampleParameter: TestTubes,
  BO_TankReading: Gauge,
  BO_TankReadingParameter: Activity,
  BO_WaterPreparation: Beaker,
  BO_WaterPrepSource: Droplet,
  BO_WaterPrepTreatment: Pipette,
  BO_WaterPrepReading: ClipboardList,
  BO_WaterChange: ArrowRightLeft,
  BO_ParameterLimitImport: Copy,
  NAV_Home: House,
  NAV_Sampling: TestTube,
  NAV_Species: Fish,
  NAV_TankReadings: Gauge,
  NAV_Tanks: Container,
  NAV_Utils: Wrench,
  NAV_Measurements: Ruler,
  NAV_WaterQuality: FlaskConical,
  NAV_Supplies: Package,
  NAV_Inhabitants: FishSymbol,
  NAV_WaterManagement: Waves,
  NAV_Admin: ShieldCheck,
  NAV_Users: Users,
  NAV_Roles: KeyRound,
  NAV_AuditLog: History,
  NAV_MyDetails: UserRound,
};

// variant "tile": the icon on a soft aqua square (page and dialog titles); "plain": the bare icon.
export function EntityIcon({ name, size = 16, variant = 'plain' }: { name?: string; size?: number; variant?: 'plain' | 'tile' }) {
  const Component = (name && ENTITY_ICONS[name]) || CircleDashed;
  if (variant === 'tile')
    return (
      <span className="icon-tile" style={{ width: size + 14, height: size + 14 }} aria-hidden>
        <Component size={size} strokeWidth={STROKE} />
      </span>
    );
  return <Component size={size} strokeWidth={STROKE} className="icon entity-icon" aria-hidden focusable={false} />;
}

export const DropIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <path d="M16 3c5.5 7 9 11.6 9 16.2A9 9 0 0 1 7 19.2C7 14.6 10.5 10 16 3z" fill="var(--accent)" />
    <path d="M12 19.5a4 4 0 0 0 4 4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ─── Statuses ───────────────────────────────────────────────────────────────
// Low / High = down / up chevron (red), OK = filled diamond (green), No limit = dashed circle.
export function ResultStatusBadge({ status }: { status: ResultStatus | string | null | undefined }) {
  if (!status) return null;
  const caption = enumCaption('ResultStatus', status);
  const icon =
    status === 'Low' ? <ChevronDown size={15} strokeWidth={2.5} /> :
    status === 'High' ? <ChevronUp size={15} strokeWidth={2.5} /> :
    status === 'OK' ? <Diamond size={12} strokeWidth={2} fill="currentColor" /> :
    <CircleDashed size={13} strokeWidth={STROKE} />;
  return (
    <span className={`status status-${String(status).toLowerCase()}`}>
      {icon}
      {caption}
    </span>
  );
}

// Stable = check circle (green), Warning = triangle (amber), Critical = x circle (red), No data = dashed circle.
export function HealthBadge({ level }: { level: TankHealthLevel | string | null | undefined }) {
  if (!level) return null;
  const caption = enumCaption('TankHealthLevel', level);
  const icon =
    level === 'Stable' ? <CircleCheck size={16} strokeWidth={2} /> :
    level === 'Warning' ? <TriangleAlert size={16} strokeWidth={2} /> :
    level === 'Critical' ? <CircleX size={16} strokeWidth={2} /> :
    <CircleDashed size={16} strokeWidth={STROKE} />;
  return (
    <span className={`health health-${String(level).toLowerCase()}`}>
      {icon}
      {caption}
    </span>
  );
}
