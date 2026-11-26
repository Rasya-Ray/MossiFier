import {
  autoincrement,
  defineContract,
  field,
  gen,
  model,
  now,
  rlsEnabled,
  sql,
  type,
} from '@prisma/orm-postgres/contract-builder';

// ============================================================
// Tabel 1: users — akun login / register (tetap, tidak berubah)
// ============================================================
const User = model('User', {
  fields: {
    id: field.column(type.Uuid()).id().onCreate(gen.uuid(7)),
    email: field.column(type.String()).unique(),
    password: field.column(type.String()),
    name: field.column(type.String()).optional(),
    created_at: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
  },
}).sql({ table: 'users' });

// ============================================================
// Tabel 2: devices — identitas + data sensor terakhir (1 baris/POST)
// Kolom sesuai payload ESP32 langsung, tanpa FK/upsert/unique.
// ============================================================
const Device = model('Device', {
  fields: {
    id: field.column(type.Int()).id().default(autoincrement()),
    device_id: field.column(type.String()),
    status: field.column(type.String()).optional(),
    co2_in: field.column(type.Int()).optional(),
    co2_out: field.column(type.Int()).optional(),
    humidity: field.column(type.Float({ storage: 'float4' })).optional(),
    brightness: field.column(type.Float({ storage: 'float4' })).optional(),
    fan_speed: field.column(type.Float({ storage: 'float4' })).optional(),
    pm1: field.column(type.Float({ storage: 'float4' })).optional(),
    pm25: field.column(type.Float({ storage: 'float4' })).optional(),
    pm10: field.column(type.Float({ storage: 'float4' })).optional(),
    pump: field.column(type.Boolean()).optional(),
    created_at: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
  },
}).sql(({ cols, constraints }) => ({
  table: 'devices',
  indexes: [
    constraints.index([cols.device_id, cols.created_at], { name: 'devices_device_created_desc' }),
  ],
}));

export const contract = defineContract({
  entities: [rlsEnabled(Device)],
  models: {
    User,
    Device,
  },
});
