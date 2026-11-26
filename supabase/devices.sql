-- ============================================================================
-- Mossifier — tabel `devices` (2 tabel total: users + devices)
-- Tabel `sensor_readings` dihapus; data sensor tinggal tunggal di `devices`.
-- Jalankan di Supabase → SQL Editor setelah `npx prisma db update`.
-- ============================================================================

-- 1) status jadi varchar (kiriman ESP32: HEALTHY / STRESSED / CRITICAL)
alter table public.devices alter column status type varchar(20);

-- 2) index untuk query "data terakhir per device"
create index if not exists devices_device_created_desc
  on public.devices (device_id, created_at desc);

-- 3) izin tulis untuk ESP32 (role anon / publishable key)
--    Web browser tidak punya policy SELECT → tetap pakai service_role via API server.
alter table public.devices enable row level security;

drop policy if exists devices_esp32_insert on public.devices;
create policy devices_esp32_insert
  on public.devices
  for insert
  to anon
  with check (device_id like 'MOSS-%');

grant insert on public.devices to anon;
