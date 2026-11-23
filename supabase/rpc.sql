-- ============================================================================
-- Mossifier — RPC untuk ESP32 (jalankan SEKALI di Supabase → SQL Editor)
--
-- Kenapa file ini ada: tabel `devices` hanya terisi kalau ESP32 berhasil
-- memanggil register_device(). Fungsi itu belum pernah dibuat di database,
-- jadi request ESP32 selalu 404 dan tabel tetap kosong.
--
-- Aman dijalankan berulang (idempotent).
-- ID device = 'MOSS-' + MAC 12 hex huruf besar, mis. MOSS-B0A7322B0960.
-- ============================================================================

-- Kolom pm10 dipakai dashboard tapi belum ada di skema lama.
alter table public.sensor_readings
  add column if not exists pm10 integer;

-- Indikator Confidence AI & Soil Raw dihapus dari dashboard → buang kolomnya.
-- (Fungsi lama yang memakai kolom ini sudah di-drop di bawah dengan cascade;
-- jalankan seluruh file ini sekaligus.)
alter table public.sensor_readings drop column if exists vision_conf;
alter table public.sensor_readings drop column if exists soil_raw;

-- Paksa format ID di level database (cadangan kalau ada klien lain).
alter table public.devices
  drop constraint if exists devices_id_format;
alter table public.devices
  add constraint devices_id_format
  check (mac_address ~ '^MOSS-[0-9A-F]{12}$') not valid;
-- "not valid" = baris lama tidak dicek; baris baru wajib sesuai format.

-- Hapus semua versi lama kedua fungsi (tipe return / parameter bisa beda,
-- sehingga "create or replace" saja ditolak dengan error 42P13).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('register_device', 'insert_sensor')
  loop
    execute 'drop function ' || r.sig || ' cascade';
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- register_device: buat baris device kalau belum ada. Mengembalikan id internal.
-- ---------------------------------------------------------------------------
create or replace function public.register_device(p_mac text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := upper(btrim(p_mac));
  v_row integer;
begin
  if v_id !~ '^MOSS-[0-9A-F]{12}$' then
    raise exception 'ID device tidak valid: harus MOSS- diikuti MAC 12 hex'
      using errcode = '22023';
  end if;

  insert into public.devices (mac_address)
  values (v_id)
  on conflict (mac_address) do nothing;

  select id into v_row from public.devices where mac_address = v_id;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- insert_sensor: simpan satu pembacaan. Device otomatis didaftarkan kalau belum.
-- ---------------------------------------------------------------------------
create or replace function public.insert_sensor(
  p_mac text,
  p_plant_status integer default null,
  p_soil_moisture real default null,
  p_mq135_1 integer default null,
  p_mq135_2 integer default null,
  p_pm1 integer default null,
  p_pm25 integer default null,
  p_pm10 integer default null,
  p_pump boolean default null,
  p_fan real default null,
  p_led real default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device integer := public.register_device(p_mac);
begin
  insert into public.sensor_readings (
    device_id, plant_status, soil_moisture,
    mq135_1, mq135_2, pm1, pm25, pm10, pump, fan, led
  ) values (
    v_device, p_plant_status, p_soil_moisture,
    p_mq135_1, p_mq135_2, p_pm1, p_pm25, p_pm10, p_pump, p_fan, p_led
  );
end;
$$;

-- ESP32 memakai publishable (anon) key → izinkan EXECUTE, tanpa akses tabel.
revoke all on function public.register_device(text) from public;
revoke all on function public.insert_sensor(
  text, integer, real, integer, integer, integer, integer, integer,
  boolean, real, real
) from public;
grant execute on function public.register_device(text) to anon, authenticated;
grant execute on function public.insert_sensor(
  text, integer, real, integer, integer, integer, integer, integer,
  boolean, real, real
) to anon, authenticated;

-- Cek cepat setelah dijalankan:
--   select public.register_device('MOSS-B0A7322B0960');
--   select * from public.devices;
