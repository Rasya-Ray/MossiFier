import {
  autoincrement,
  defineContract,
  field,
  gen,
  model,
  now,
  rel,
  rlsEnabled,
  sql,
  type,
} from '@prisma/orm-postgres/contract-builder';

// ============================================================
// Tabel 1: users — akun login / register (sudah ada, tidak berubah)
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
// Tabel 2: devices — identitas perangkat (MAC address unik)
// ============================================================
const Device = model('Device', {
  fields: {
    id: field.column(type.Int()).id().default(autoincrement()),
    mac_address: field.column(type.String()).unique(),
    user_id: field.column(type.Uuid()).optional(),
    name: field.column(type.String()).optional(),
    claimed_at: field.column(type.DateTime()).optional(),
    created_at: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
  },
  relations: {
    owner: rel.belongsTo(User, { from: 'user_id', to: 'id' }).sql({ fk: { constraint: true } }),
  },
}).sql(({ cols, constraints }) => ({
  table: 'devices',
  indexes: [
    constraints.index([cols.user_id], { name: 'devices_owner' }),
  ],
}));

// ============================================================
// Tabel 3: sensor_readings — riwayat sensor (1 baris per kiriman)
// ============================================================
const SensorReading = model('SensorReading', {
  fields: {
    id: field
      .column(type.Uuid())
      .id()
      .default(sql`gen_random_uuid()`)
      .onCreate(gen.uuid(7)),
    device_id: field.column(type.Int()),
    created_at: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
    plant_status: field.column(type.Int()).optional(),
    vision_conf: field.column(type.Float({ storage: 'float4' })).optional(),
    soil_moisture: field.column(type.Float({ storage: 'float4' })).optional(),
    soil_raw: field.column(type.Int()).optional(),
    mq135_1: field.column(type.Int()).optional(),
    mq135_2: field.column(type.Int()).optional(),
    pm1: field.column(type.Int()).optional(),
    pm25: field.column(type.Int()).optional(),
    pump: field.column(type.Boolean()).optional(),
    // Persentase 0–100 (bukan boolean)
    fan: field.column(type.Float({ storage: 'float4' })).optional(),
    led: field.column(type.Float({ storage: 'float4' })).optional(),
  },
  relations: {
    device: rel.belongsTo(Device, { from: 'device_id', to: 'id' }).sql({ fk: { constraint: true } }),
  },
}).sql(({ cols, constraints }) => ({
  table: 'sensor_readings',
  indexes: [
    constraints.index([cols.device_id, cols.created_at], { name: 'sensor_readings_device_desc' }),
  ],
}));

// ============================================================
// Kontrak — FK constraint fisik + RLS
// ============================================================
export const contract = defineContract({
  entities: [rlsEnabled(Device), rlsEnabled(SensorReading)],
  models: {
    User,
    Device,
    SensorReading,
  },
});