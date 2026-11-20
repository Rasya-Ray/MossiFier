import {
  defineContract,
  field,
  gen,
  model,
  now,
  policyInsert,
  policySelect,
  rlsEnabled,
  role,
  sql,
  type,
} from '@prisma/orm-postgres/contract-builder';

// Akun untuk register/login
const User = model('User', {
  fields: {
    id: field.column(type.Uuid()).id().onCreate(gen.uuid(7)),
    email: field.column(type.String()).unique(),
    password: field.column(type.String()), // hash, bukan plaintext
    name: field.column(type.String()).optional(),
    created_at: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
  },
}).sql({ table: 'users' });

// Satu-satunya tabel yang di-POST ESP32 (1 baris = 1 kiriman sensor)
const Device = model('Device', {
  fields: {
    // Default di database supaya ESP32 bisa POST tanpa mengirim id.
    id: field
      .column(type.Uuid())
      .id()
      .default(sql`gen_random_uuid()`)
      .onCreate(gen.uuid(7)),
    device_id: field.column(type.String()), // MOSS-XXXXXX dari ESP32
    status: field.column(type.String()).optional(), // teks bebas, mis. "Sehat"
    air_quality: field.column(type.Int()).optional(),
    co2_in: field.column(type.Int()).optional(),
    co2_out: field.column(type.Int()).optional(),
    humidity: field.column(type.Int()).optional(),
    brightness: field.column(type.Int()).optional(),
    fan_speed: field.column(type.Int()).optional(),
    created_at: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
  },
}).sql({ table: 'devices' });

// Role anon dipakai dashboard (select) dan ESP32 (insert) lewat REST + Realtime.
const anon = role('anon');

export const contract = defineContract({
  entities: [
    rlsEnabled(Device),
    policySelect(Device, {
      name: 'anon_read_devices',
      roles: [anon],
      using: sql`true`,
    }),
    policyInsert(Device, {
      name: 'anon_insert_devices',
      roles: [anon],
      withCheck: sql`true`,
    }),
  ],
  models: {
    User,
    Device,
  },
});
