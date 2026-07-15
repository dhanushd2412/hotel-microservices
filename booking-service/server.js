import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { query } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4001);

// Requests now arrive via the Ingress, which can be reached at different
// hosts (minikube ip, NodePort, custom domain). Default to reflecting the
// request's own origin instead of a single hardcoded one; set CORS_ORIGIN
// to lock this down to a specific origin if needed.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

const roomTypes = [
  { id: "mini-standard", name: "Mini Standard",  price: 1500, capacity: 1, total: 2 },
  { id: "standard",      name: "Standard Room",  price: 2200, capacity: 2, total: 5 },
  { id: "deluxe",        name: "Deluxe Room",    price: 3200, capacity: 3, total: 2 },
  { id: "family",        name: "Family Room",    price: 4600, capacity: 4, total: 2 },
];

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "booking-service" });
});

app.get("/api/rooms", (req, res) => {
  res.json(roomTypes);
});

app.get("/api/bookings", async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const params = [];
    const where = [];

    if (from) {
      params.push(from);
      where.push(`check_out >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      where.push(`check_in <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await query(
      `SELECT id, guest_name, guest_phone, check_in, check_out, guests,
              room_id, room_name, rooms, nights, subtotal, tax, total,
              status, group_id, created_at
       FROM bookings
       ${whereSql}
       ORDER BY check_in DESC, created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/bookings/booked-dates", async (req, res, next) => {
  try {
    const { roomId, from, to } = req.query;

    if (!roomId || !from || !to) {
      return res.status(400).json({ message: "roomId, from, and to are required." });
    }

    const result = await query(
      `SELECT check_in, check_out
       FROM bookings
       WHERE room_id = $1
         AND status != 'Cancelled'
         AND check_in < $3
         AND check_out > $2
       ORDER BY check_in`,
      [roomId, from, to]
    );

    const ranges = result.rows.map(row => ({
      checkIn: row.check_in.toISOString().slice(0, 10),
      checkOut: row.check_out.toISOString().slice(0, 10)
    }));

    res.json(ranges);
  } catch (error) {
    next(error);
  }
});

app.post("/api/bookings", async (req, res, next) => {
  try {
    const booking = validateBooking(req.body);
    const overlap = await hasOverlappingBooking(booking.roomId, booking.checkIn, booking.checkOut);

    if (overlap) {
      return res.status(409).json({
        message: "Sorry, this room is already booked for the selected dates. Please choose different dates or another room type."
      });
    }

    const result = await query(
      `INSERT INTO bookings (
        guest_name, guest_phone, check_in, check_out, guests,
        room_id, room_name, rooms, nights, subtotal, tax, total, status, group_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Confirmed', $13)
      RETURNING *`,
      [
        booking.name, booking.phone, booking.checkIn, booking.checkOut,
        booking.guests, booking.roomId, booking.roomName, booking.rooms,
        booking.nights, booking.subtotal, booking.tax, booking.total,
        booking.groupId || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/bookings/:id/status", async (req, res, next) => {
  try {
    const allowedStatuses = ["Confirmed", "Checked in", "Completed", "Cancelled"];
    const status = String(req.body.status || "");

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid booking status." });
    }

    const result = await query(
      "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *",
      [status, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: "Booking not found." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Admin-only: delete all bookings (called from dashboard via auth token validated client-side)
app.delete("/api/bookings", async (req, res, next) => {
  try {
    await query("DELETE FROM bookings");
    res.json({ ok: true, message: "All bookings deleted." });
  } catch (error) {
    next(error);
  }
});

// Aggregate stats for chat-service demand prediction (avoids direct DB access in chat-service)
app.get("/api/demand-stats", async (req, res, next) => {
  try {
    const [dow, monthly, popularRooms, peakDates, stats, mom] = await Promise.all([
      query(`
        SELECT EXTRACT(DOW FROM check_in)::int AS dow, COUNT(*)::int AS cnt
        FROM bookings WHERE status != 'Cancelled'
        GROUP BY dow ORDER BY dow
      `),
      query(`
        SELECT TO_CHAR(check_in, 'Mon YYYY') AS label,
               TO_CHAR(check_in, 'YYYY-MM') AS key,
               COUNT(*)::int AS cnt,
               COALESCE(SUM(total), 0) AS revenue
        FROM bookings
        WHERE status != 'Cancelled'
          AND check_in >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY label, key ORDER BY key
      `),
      query(`
        SELECT room_name, COUNT(*)::int AS cnt
        FROM bookings WHERE status != 'Cancelled'
        GROUP BY room_name ORDER BY cnt DESC LIMIT 4
      `),
      query(`
        SELECT check_in::date AS dt, COUNT(*)::int AS cnt
        FROM bookings
        WHERE status != 'Cancelled'
          AND check_in >= CURRENT_DATE - INTERVAL '3 months'
        GROUP BY dt ORDER BY cnt DESC LIMIT 5
      `),
      query(`
        SELECT
          COUNT(*)::int,
          (COUNT(*) FILTER (WHERE status != 'Cancelled'))::int,
          COALESCE(SUM(total) FILTER (WHERE status != 'Cancelled'), 0),
          COALESCE(AVG(nights) FILTER (WHERE status != 'Cancelled'), 0),
          (COUNT(*) FILTER (WHERE status = 'Cancelled'))::int
        FROM bookings
      `),
      query(`
        SELECT
          (COUNT(*) FILTER (WHERE check_in >= DATE_TRUNC('month', CURRENT_DATE)))::int,
          (COUNT(*) FILTER (WHERE check_in >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                              AND check_in <  DATE_TRUNC('month', CURRENT_DATE)))::int,
          COALESCE(SUM(total) FILTER (WHERE check_in >= DATE_TRUNC('month', CURRENT_DATE)
                                        AND status != 'Cancelled'), 0),
          COALESCE(SUM(total) FILTER (WHERE check_in >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                                        AND check_in <  DATE_TRUNC('month', CURRENT_DATE)
                                        AND status != 'Cancelled'), 0)
        FROM bookings
      `)
    ]);

    const s = stats.rows[0];
    const m = mom.rows[0];

    res.json({
      dowRows:           dow.rows.map(r => [r.dow, r.cnt]),
      monthRows:         monthly.rows.map(r => [r.label, r.key, r.cnt, parseFloat(r.revenue)]),
      popularRooms:      popularRooms.rows.map(r => [r.room_name, r.cnt]),
      peakDates:         peakDates.rows.map(r => [r.dt, r.cnt]),
      totalBookings:     Number(s[0] || 0),
      activeBookings:    Number(s[1] || 0),
      totalRevenue:      parseFloat(s[2] || 0),
      avgNights:         parseFloat(s[3] || 0),
      cancelledCount:    Number(s[4] || 0),
      thisMonthBookings: Number(m[0] || 0),
      lastMonthBookings: Number(m[1] || 0),
      thisMonthRevenue:  parseFloat(m[2] || 0),
      lastMonthRevenue:  parseFloat(m[3] || 0),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || "Something went wrong." });
});

app.listen(port, () => {
  console.log(`booking-service running on http://localhost:${port}`);
});

function validateBooking(body) {
  const required = ["name", "phone", "checkIn", "checkOut", "roomId", "roomName"];
  const missing = required.filter((key) => !body[key]);

  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const checkIn = new Date(body.checkIn);
  const checkOut = new Date(body.checkOut);

  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
    const error = new Error("Check-out date must be after check-in date.");
    error.status = 400;
    throw error;
  }

  return {
    name: String(body.name).trim(),
    phone: String(body.phone).trim(),
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    guests: Number(body.guests || 1),
    roomId: String(body.roomId),
    roomName: String(body.roomName),
    rooms: Number(body.rooms || 1),
    nights: Number(body.nights || 1),
    subtotal: Number(body.subtotal || 0),
    tax: Number(body.tax || 0),
    total: Number(body.total || 0),
    groupId: body.groupId || null
  };
}

async function hasOverlappingBooking(roomId, checkIn, checkOut) {
  const result = await query(
    `SELECT id FROM bookings
     WHERE room_id = $1 AND status != 'Cancelled'
       AND check_in < $3 AND check_out > $2
     LIMIT 1`,
    [roomId, checkIn, checkOut]
  );
  return result.rowCount > 0;
}
