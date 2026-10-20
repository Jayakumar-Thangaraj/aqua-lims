import mongoose, { Schema, type Model } from 'mongoose';

const CI = { locale: 'en', strength: 2 } as const;

const permissionSchema = new Schema(
  {
    type: { type: String, required: true },
    read: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    write: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    navigate: { type: Boolean, default: false },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    userName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    changePasswordOnFirstLogon: { type: Boolean, default: false },
    roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
    lastLoginAt: { type: Date, default: null },
    legacyOid: { type: String, default: null },
  },
  { timestamps: true, collection: 'users' },
);
userSchema.index({ userName: 1 }, { unique: true, collation: CI });

const roleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    isAdministrative: { type: Boolean, default: false },
    permissions: { type: [permissionSchema], default: [] },
    legacyOid: { type: String, default: null },
  },
  { timestamps: true, collection: 'roles' },
);
roleSchema.index({ name: 1 }, { unique: true, collation: CI });

const auditLogSchema = new Schema(
  {
    at: { type: Date, required: true },
    userId: { type: String, default: null },
    userName: { type: String, default: null },
    entity: { type: String, required: true },
    entityId: { type: String, required: true },
    entityDisplay: { type: String, default: null },
    operation: { type: String, required: true },
    property: { type: String, default: null },
    oldValue: { type: String, default: null },
    newValue: { type: String, default: null },
    parentEntity: { type: String, default: null },
    parentId: { type: String, default: null },
  },
  { collection: 'auditLogs', versionKey: false },
);
auditLogSchema.index({ entity: 1, entityId: 1, at: -1 });
auditLogSchema.index({ at: -1 });

const viewSettingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    viewKey: { type: String, required: true },
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'userViewSettings', minimize: false },
);
viewSettingSchema.index({ userId: 1, viewKey: 1 }, { unique: true });

const counterSchema = new Schema({ _id: { type: String }, seq: { type: Number, default: 0 } }, { collection: 'counters', versionKey: false });

export function registerSystemModels(): void {
  if (!mongoose.models.User) mongoose.model('User', userSchema);
  if (!mongoose.models.Role) mongoose.model('Role', roleSchema);
  if (!mongoose.models.AuditLog) mongoose.model('AuditLog', auditLogSchema);
  if (!mongoose.models.ViewSetting) mongoose.model('ViewSetting', viewSettingSchema);
  if (!mongoose.models.Counter) mongoose.model('Counter', counterSchema);
}

export const User = (): Model<any> => mongoose.model('User');
export const Role = (): Model<any> => mongoose.model('Role');
export const AuditLog = (): Model<any> => mongoose.model('AuditLog');
export const ViewSetting = (): Model<any> => mongoose.model('ViewSetting');
export const Counter = (): Model<any> => mongoose.model('Counter');
