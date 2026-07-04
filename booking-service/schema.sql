CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  guests integer NOT NULL CHECK (guests > 0),
  room_id text NOT NULL,
  room_name text NOT NULL,
  rooms integer NOT NULL CHECK (rooms > 0),
  nights integer NOT NULL CHECK (nights > 0),
  subtotal numeric(10, 2) NOT NULL,
  tax numeric(10, 2) NOT NULL,
  total numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'Confirmed',
  group_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_date_room_idx
  ON bookings (room_id, check_in, check_out);
