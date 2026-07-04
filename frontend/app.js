const hotel = {
  name: "Hotel Vinayagam",
  city: "Tamil Nadu",
  area: "Main Road",
  rating: 4.6,
  amenities: ["Breakfast", "AC rooms", "Wi-Fi", "Parking", "Room service"],
  rooms: [
    {
      id: "mini-standard",
      name: "Mini Standard",
      price: 1500,
      capacity: 1,
      description: "Compact AC room ideal for solo travelers."
    },
    {
      id: "standard",
      name: "Standard Room",
      price: 2200,
      capacity: 2,
      description: "Comfortable AC room for solo travelers or couples."
    },
    {
      id: "deluxe",
      name: "Deluxe Room",
      price: 3200,
      capacity: 3,
      description: "Larger room with extra seating and premium bedding."
    },
    {
      id: "family",
      name: "Family Room",
      price: 4600,
      capacity: 4,
      description: "Spacious room for families with added sleeping space."
    }
  ]
};

const state = {
  selectedRoomId: "mini-standard",
  bookings: [],
  bookedRanges: []
};

const BOOKING_API = "http://localhost:4001/api";
const CHAT_API = "http://localhost:5001";

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const bookingForm = document.querySelector("#bookingForm");
const guestName = document.querySelector("#guestName");
const guestPhone = document.querySelector("#guestPhone");
const checkIn = document.querySelector("#checkIn");
const checkOut = document.querySelector("#checkOut");
const guests = document.querySelector("#guests");
const roomType = document.querySelector("#roomType");
const roomGrid = document.querySelector("#roomGrid");
const selectedHotel = document.querySelector("#selectedHotel");
const roomTotal = document.querySelector("#roomTotal");
const taxTotal = document.querySelector("#taxTotal");
const grandTotal = document.querySelector("#grandTotal");
const nightCount = document.querySelector("#nightCount");
const roomCount = document.querySelector("#roomCount");
const bookingTable = document.querySelector("#bookingTable");
const bookedDatesInfo = document.querySelector("#bookedDatesInfo");
const toast = document.querySelector("#toast");

function setInitialDates() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  checkIn.value = toDateInput(tomorrow);
  checkOut.value = toDateInput(dayAfter);
  checkIn.min = toDateInput(today);
  checkOut.min = toDateInput(dayAfter);
}

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function getNights() {
  const start = new Date(checkIn.value);
  const end = new Date(checkOut.value);
  const diff = Math.round((end - start) / 86400000);
  return Math.max(diff, 1);
}

function getFilteredRooms() {
  const count = Number(guests.value || 1);
  return hotel.rooms.filter(room => count <= room.capacity);
}

function getSelectedRoom() {
  const filtered = getFilteredRooms();
  return filtered.find((room) => room.id === state.selectedRoomId) || filtered[0] || hotel.rooms[0];
}

function getRoomsNeeded(room) {
  return Math.max(1, Math.ceil(Number(guests.value || 1) / room.capacity));
}

function getBookingTotal() {
  const room = getSelectedRoom();
  const nights = getNights();
  const rooms = getRoomsNeeded(room);
  const subtotal = room.price * nights * rooms;
  const tax = Math.round(subtotal * 0.12);

  return {
    room,
    nights,
    rooms,
    subtotal,
    tax,
    total: subtotal + tax
  };
}

function renderRoomOptions() {
  const guestOverflow = document.querySelector("#guestOverflow");
  const count = Number(guests.value || 1);
  const filtered = getFilteredRooms();

  if (count >= 5) {
    roomType.innerHTML = "";
    roomGrid.innerHTML = "";
    if (guestOverflow) {
      guestOverflow.style.display = "";
      renderGroupDefault(guestOverflow);
    }
    bookedDatesInfo.style.display = "none";
    setGroupSummaryVisible(false);
    return;
  }

  if (guestOverflow) guestOverflow.style.display = "none";
  setGroupSummaryVisible(true);

  if (filtered.length && !filtered.find(r => r.id === state.selectedRoomId)) {
    state.selectedRoomId = filtered[0].id;
  }

  roomType.innerHTML = filtered
    .map((room) => `<option value="${room.id}">${room.name} - ${formatter.format(room.price)} / night</option>`)
    .join("");
  roomType.value = state.selectedRoomId;

  roomGrid.innerHTML = filtered
    .map((room) => {
      const isSelected = room.id === state.selectedRoomId;
      return `
        <button class="room-card ${isSelected ? "active" : ""}" type="button" data-room-id="${room.id}">
          <span>${room.name}</span>
          <strong>${formatter.format(room.price)}</strong>
          <small>Up to ${room.capacity} ${room.capacity === 1 ? "adult" : "adults"} · ${room.description}</small>
        </button>
      `;
    })
    .join("");
}

function renderBookingSummary() {
  const summary = getBookingTotal();

  nightCount.textContent = `${summary.nights} ${summary.nights === 1 ? "night" : "nights"}`;
  roomCount.textContent = `${summary.rooms} ${summary.rooms === 1 ? "room" : "rooms"}`;
  selectedHotel.innerHTML = `
    <strong>${hotel.name}</strong><br />
    ${summary.room.name} · ${guests.value} ${Number(guests.value) === 1 ? "guest" : "guests"} · ${summary.rooms} ${summary.rooms === 1 ? "room" : "rooms"}
  `;
  roomTotal.textContent = formatter.format(summary.subtotal);
  taxTotal.textContent = formatter.format(summary.tax);
  grandTotal.textContent = formatter.format(summary.total);
}

function normalizeBooking(booking) {
  return {
    id: booking.id,
    name: booking.name || booking.guest_name,
    phone: booking.phone || booking.guest_phone,
    checkIn: formatDateOnly(booking.checkIn || booking.check_in),
    checkOut: formatDateOnly(booking.checkOut || booking.check_out),
    guests: Number(booking.guests),
    roomId: booking.roomId || booking.room_id,
    roomName: booking.roomName || booking.room_name,
    rooms: Number(booking.rooms),
    nights: Number(booking.nights),
    subtotal: Number(booking.subtotal),
    tax: Number(booking.tax),
    total: Number(booking.total),
    status: booking.status || "Confirmed",
    createdAt: booking.createdAt || booking.created_at,
    groupId: booking.groupId || booking.group_id || null
  };
}

function formatDateOnly(value) {
  return String(value || "").slice(0, 10);
}

function renderSavedBookings() {
  if (!state.bookings.length) {
    bookingTable.innerHTML = `
      <tr>
        <td colspan="6" class="empty-table">No bookings yet. Your bookings will appear here after you book.</td>
      </tr>
    `;
    return;
  }

  const grouped = [];
  const groupMap = new Map();

  for (const booking of state.bookings) {
    if (booking.groupId) {
      if (groupMap.has(booking.groupId)) {
        groupMap.get(booking.groupId).push(booking);
      } else {
        const arr = [booking];
        groupMap.set(booking.groupId, arr);
        grouped.push({ type: "group", bookings: arr });
      }
    } else {
      grouped.push({ type: "single", booking });
    }
  }

  bookingTable.innerHTML = grouped
    .map((entry) => {
      if (entry.type === "single") {
        const b = entry.booking;
        return `
          <tr>
            <td>${escapeHtml(b.name)}</td>
            <td>${escapeHtml(b.phone)}</td>
            <td>${b.checkIn} to ${b.checkOut}</td>
            <td>${b.roomName}</td>
            <td>${formatter.format(b.total)}</td>
            <td><span class="status-pill">${b.status}</span></td>
          </tr>`;
      }

      const items = entry.bookings;
      const first = items[0];
      const totalAmount = items.reduce((sum, b) => sum + b.total, 0);

      const roomCounts = new Map();
      for (const b of items) {
        roomCounts.set(b.roomName, (roomCounts.get(b.roomName) || 0) + 1);
      }
      const roomLabel = Array.from(roomCounts.entries())
        .map(([name, count]) => count > 1 ? `${count} ${name}` : name)
        .join(" + ");

      return `
        <tr>
          <td>${escapeHtml(first.name)}</td>
          <td>${escapeHtml(first.phone)}</td>
          <td>${first.checkIn} to ${first.checkOut}</td>
          <td>${roomLabel}</td>
          <td>${formatter.format(totalAmount)}</td>
          <td><span class="status-pill">${first.status}</span></td>
        </tr>`;
    })
    .join("");
}


async function fetchBookedDates(roomId) {
  try {
    const today = new Date();
    const from = toDateInput(today);
    const futureDate = new Date(today);
    futureDate.setMonth(futureDate.getMonth() + 3);
    const to = toDateInput(futureDate);

    const response = await fetch(
      `${BOOKING_API}/bookings/booked-dates?roomId=${encodeURIComponent(roomId)}&from=${from}&to=${to}`
    );
    if (!response.ok) throw new Error("Failed to fetch booked dates.");
    state.bookedRanges = await response.json();
  } catch (error) {
    console.info("Could not fetch booked dates.", error);
    state.bookedRanges = [];
  }
  renderBookedDates();
  checkDateOverlap();
}

function renderBookedDates() {
  if (!state.bookedRanges.length) {
    bookedDatesInfo.style.display = "none";
    return;
  }

  bookedDatesInfo.style.display = "";

  const pills = state.bookedRanges.map(range => {
    const ciDate = new Date(range.checkIn + "T00:00:00");
    const coDate = new Date(range.checkOut + "T00:00:00");
    const ciLabel = ciDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    const coLabel = coDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
    return `<span class="booked-date-pill">${ciLabel} – ${coLabel}</span>`;
  }).join("");

  bookedDatesInfo.innerHTML = `
    <p class="booked-dates-title">Booked dates for this room</p>
    <div class="booked-dates-pills">${pills}</div>
    <div id="dateOverlapWarning"></div>
  `;
}

function checkDateOverlap() {
  const warningEl = document.querySelector("#dateOverlapWarning");
  if (!warningEl) return;

  const selectedCheckIn = checkIn.value;
  const selectedCheckOut = checkOut.value;

  if (!selectedCheckIn || !selectedCheckOut) {
    warningEl.innerHTML = "";
    return;
  }

  const hasOverlap = state.bookedRanges.some(range =>
    selectedCheckIn < range.checkOut && selectedCheckOut > range.checkIn
  );

  if (hasOverlap) {
    warningEl.innerHTML = `<div class="date-overlap-warning">Your selected dates overlap with an existing booking. Please choose different dates or another room type.</div>`;
  } else {
    warningEl.innerHTML = "";
  }
}

function updateDateLimits() {
  const start = new Date(checkIn.value);
  const nextDay = new Date(start);
  nextDay.setDate(start.getDate() + 1);
  checkOut.min = toDateInput(nextDay);
  if (new Date(checkOut.value) <= start) {
    checkOut.value = toDateInput(nextDay);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sync() {
  renderRoomOptions();
  renderBookingSummary();
  renderSavedBookings();
}

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const summary = getBookingTotal();
  const booking = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    hotelName: hotel.name,
    name: guestName.value.trim(),
    phone: guestPhone.value.trim(),
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    guests: Number(guests.value),
    roomId: summary.room.id,
    roomName: summary.room.name,
    rooms: summary.rooms,
    nights: summary.nights,
    subtotal: summary.subtotal,
    tax: summary.tax,
    total: summary.total,
    status: "Confirmed",
    createdAt: new Date().toISOString()
  };

  try {
    const savedBooking = await saveBookingToBackend(booking);
    state.bookings.unshift(savedBooking);
    bookingForm.reset();
    setInitialDates();
    state.selectedRoomId = "mini-standard";
    guests.value = "1";
    sync();
    fetchBookedDates(state.selectedRoomId);
    showToast(`Booking confirmed for ${savedBooking.name} at ${hotel.name}.`);
    fetchAndShowAISummary(savedBooking);
  } catch (error) {
    showToast(error.message);
  }
});

async function saveBookingToBackend(booking) {
  try {
    const response = await fetch(`${BOOKING_API}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booking)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const err = new Error(errorData.message || "Backend booking failed.");
      err.status = response.status;
      throw err;
    }

    return normalizeBooking(await response.json());
  } catch (error) {
    if (error.status === 409) throw error;
    console.info("Saved booking locally because backend is unavailable.", error);
    return booking;
  }
}

roomGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-room-id]");
  if (!button) return;
  state.selectedRoomId = button.dataset.roomId;
  roomType.value = state.selectedRoomId;
  sync();
  fetchBookedDates(state.selectedRoomId);
});

roomType.addEventListener("change", (event) => {
  state.selectedRoomId = event.target.value;
  sync();
  fetchBookedDates(state.selectedRoomId);
});

checkIn.addEventListener("change", () => {
  updateDateLimits();
  renderBookingSummary();
  checkDateOverlap();
});

checkOut.addEventListener("change", () => {
  renderBookingSummary();
  checkDateOverlap();
});
guests.addEventListener("input", () => {
  sync();
  fetchBookedDates(state.selectedRoomId);
});

const roomInventory = {
  "family": 2,
  "deluxe": 2,
  "standard": 5,
  "mini-standard": 2
};

const summaryCard = document.querySelector(".booking-summary-card");

function setGroupSummaryVisible(show) {
  if (summaryCard) summaryCard.style.display = show ? "" : "none";
}

async function checkGroupAvailability() {
  const guestOverflow = document.querySelector("#guestOverflow");
  if (!guestOverflow) return;

  const ciVal = checkIn.value;
  const coVal = checkOut.value;
  if (!ciVal || !coVal) {
    renderGroupDefault(guestOverflow);
    return;
  }

  guestOverflow.innerHTML = `<p style="padding:24px;text-align:center;color:var(--muted);font-size:0.9rem;">Checking room availability...</p>`;

  const guestCount = Number(guests.value || 1);
  const nights = getNights();
  const fillOrder = [...hotel.rooms].reverse();

  const availability = [];
  for (const room of fillOrder) {
    const maxRooms = roomInventory[room.id] || 1;
    let bookedCount = 0;
    try {
      const res = await fetch(
        `${BOOKING_API}/bookings/booked-dates?roomId=${encodeURIComponent(room.id)}&from=${ciVal}&to=${coVal}`
      );
      if (res.ok) {
        const booked = await res.json();
        bookedCount = booked.filter(r => ciVal < r.checkOut && coVal > r.checkIn).length;
      }
    } catch {}
    const freeRooms = Math.max(0, maxRooms - bookedCount);
    availability.push({ ...room, maxRooms, bookedCount, freeRooms });
  }

  const suggestedQty = {};
  let rem = guestCount;
  for (const r of availability) {
    if (rem <= 0 || r.freeRooms === 0) { suggestedQty[r.id] = 0; continue; }
    const use = Math.min(Math.ceil(rem / r.capacity), r.freeRooms);
    suggestedQty[r.id] = use;
    rem -= use * r.capacity;
  }

  const qty = {};
  availability.forEach(r => { qty[r.id] = suggestedQty[r.id]; });

  let activePreset = "suggested";

  function applyPreset(preset) {
    activePreset = preset;
    availability.forEach(r => {
      if (preset === "suggested") qty[r.id] = suggestedQty[r.id];
      else if (preset === "available") qty[r.id] = r.freeRooms;
      else if (preset === "all") qty[r.id] = r.maxRooms;
    });
    renderGroupUI();
  }

  function renderGroupUI() {
    let totalRooms = 0, totalGuests = 0, totalSub = 0;
    availability.forEach(r => {
      totalRooms += qty[r.id];
      totalGuests += qty[r.id] * r.capacity;
      totalSub += qty[r.id] * r.price * nights;
    });
    const totalTax = Math.round(totalSub * 0.12);
    const totalGrand = totalSub + totalTax;

    const btnStyle = (active) => `padding:7px 14px;border-radius:8px;font-size:0.78rem;font-weight:800;cursor:pointer;border:1px solid ${active ? "var(--gold)" : "var(--line)"};background:${active ? "rgba(201,168,76,0.15)" : "var(--surface)"};color:${active ? "var(--primary)" : "var(--muted)"};`;
    const qtyBtnStyle = `width:30px;height:30px;border-radius:6px;border:1px solid var(--line);background:var(--surface);font-size:1rem;font-weight:800;cursor:pointer;display:inline-grid;place-items:center;`;

    const roomRows = availability.map(r => {
      const q = qty[r.id];
      const maxQ = activePreset === "all" ? r.maxRooms : r.freeRooms;
      const rowSub = q * r.price * nights;
      const rowGuests = q * r.capacity;
      const booked = r.maxRooms - r.freeRooms;
      const availLabel = r.freeRooms < r.maxRooms ? ` (${booked} booked)` : "";

      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);${q === 0 ? "opacity:0.45;" : ""}">
        <div style="flex:1;min-width:0;">
          <strong style="font-size:0.9rem;">${r.name}</strong>
          <span style="color:var(--muted);font-size:0.78rem;margin-left:4px;">${r.capacity} ${r.capacity === 1 ? "adult" : "adults"}/room &middot; ${r.freeRooms}/${r.maxRooms} free${availLabel}</span>
          ${q > 0 ? `<div style="font-size:0.8rem;color:var(--muted);margin-top:2px;">${rowGuests} guest${rowGuests === 1 ? "" : "s"} &middot; ${formatter.format(rowSub)}</div>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <button type="button" class="group-qty-btn" data-room="${r.id}" data-dir="-1" style="${qtyBtnStyle}" ${q <= 0 ? "disabled" : ""}>−</button>
          <span style="min-width:24px;text-align:center;font-weight:800;font-size:0.95rem;">${q}</span>
          <button type="button" class="group-qty-btn" data-room="${r.id}" data-dir="1" style="${qtyBtnStyle}" ${q >= maxQ ? "disabled" : ""}>+</button>
        </div>
      </div>`;
    }).join("");

    guestOverflow.innerHTML = `
      <div style="padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--soft);">
        <p style="margin:0 0 6px;font-weight:800;color:var(--ink);font-size:0.95rem;">Group Booking</p>
        <p style="margin:0 0 12px;color:var(--muted);font-size:0.88rem;">${guestCount} adults &middot; ${nights} ${nights === 1 ? "night" : "nights"}</p>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
          <button type="button" class="group-preset" data-preset="suggested" style="${btnStyle(activePreset === "suggested")}">Suggested</button>
          <button type="button" class="group-preset" data-preset="available" style="${btnStyle(activePreset === "available")}">All Available</button>
          <button type="button" class="group-preset" data-preset="all" style="${btnStyle(activePreset === "all")}">All Rooms</button>
        </div>

        <div>${roomRows}</div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid var(--line);margin-top:4px;">
          <div>
            <strong style="font-size:0.88rem;">${totalRooms} room${totalRooms === 1 ? "" : "s"} selected &middot; ${totalGuests} guest${totalGuests === 1 ? "" : "s"} covered</strong>
            ${totalGuests < guestCount ? `<div style="font-size:0.8rem;color:#721c24;margin-top:2px;">${guestCount - totalGuests} more guests need rooms</div>` : ""}
            ${totalGuests >= guestCount ? `<div style="font-size:0.8rem;color:var(--accent);margin-top:2px;">All guests accommodated</div>` : ""}
          </div>
          <strong style="font-size:1.1rem;color:var(--gold);">${formatter.format(totalGrand)}</strong>
        </div>

        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
          <button type="button" id="bookAllRooms" style="flex:1;min-height:44px;border:0;border-radius:8px;background:var(--gold);color:var(--primary);font-weight:800;font-size:0.88rem;cursor:pointer;min-width:180px;" ${totalRooms === 0 ? "disabled" : ""}>
            Book ${totalRooms} Room${totalRooms === 1 ? "" : "s"}
          </button>
          <button type="button" id="bookOneByOne" style="flex:1;min-height:44px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-weight:800;font-size:0.88rem;cursor:pointer;min-width:140px;">
            Book One by One
          </button>
        </div>
        <p id="groupStatus" style="margin:8px 0 0;font-size:0.85rem;color:var(--muted);text-align:center;"></p>
      </div>`;

    guestOverflow.querySelectorAll(".group-qty-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const roomId = btn.dataset.room;
        const dir = Number(btn.dataset.dir);
        const r = availability.find(x => x.id === roomId);
        const maxQ = activePreset === "all" ? r.maxRooms : r.freeRooms;
        qty[roomId] = Math.max(0, Math.min(maxQ, qty[roomId] + dir));
        activePreset = "";
        renderGroupUI();
      });
    });

    guestOverflow.querySelectorAll(".group-preset").forEach(btn => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
    });

    document.getElementById("bookAllRooms").addEventListener("click", async () => {
      const bookBtn = document.getElementById("bookAllRooms");
      const statusEl = document.getElementById("groupStatus");
      bookBtn.disabled = true;
      bookBtn.textContent = "Booking rooms...";
      statusEl.textContent = "Booking rooms...";
      document.getElementById("bookOneByOne").disabled = true;

      const nameVal = guestName.value.trim();
      const phoneVal = guestPhone.value.trim();
      if (!nameVal || !phoneVal) {
        showToast("Please enter guest name and phone number first.");
        bookBtn.disabled = false;
        bookBtn.textContent = `Book ${totalRooms} Room${totalRooms === 1 ? "" : "s"}`;
        document.getElementById("bookOneByOne").disabled = false;
        statusEl.textContent = "";
        return;
      }

      const groupId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      let successCount = 0;
      for (const r of availability) {
        for (let i = 0; i < qty[r.id]; i++) {
          const sub = r.price * nights;
          const tx = Math.round(sub * 0.12);
          const booking = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
            hotelName: hotel.name,
            name: nameVal,
            phone: phoneVal,
            checkIn: ciVal,
            checkOut: coVal,
            guests: r.capacity,
            roomId: r.id,
            roomName: r.name,
            rooms: 1,
            nights: nights,
            subtotal: sub,
            tax: tx,
            total: sub + tx,
            status: "Confirmed",
            createdAt: new Date().toISOString(),
            groupId: groupId
          };
          try {
            const saved = await saveBookingToBackend(booking);
            state.bookings.unshift(saved);
            successCount++;
          } catch (err) {
            showToast(`${r.name}: ${err.message}`);
          }
        }
      }

      if (successCount > 0) {
        statusEl.textContent = "All rooms booked successfully!";
        statusEl.style.color = "var(--accent)";
        statusEl.style.fontWeight = "800";
        showToast(`${successCount} room${successCount > 1 ? "s" : ""} booked for ${nameVal}.`);
        setTimeout(() => {
          bookingForm.reset();
          setInitialDates();
          state.selectedRoomId = "mini-standard";
          guests.value = "1";
          sync();
          fetchBookedDates(state.selectedRoomId);
        }, 1500);
      }
    });

    document.getElementById("bookOneByOne").addEventListener("click", () => {
      guests.value = "1";
      state.selectedRoomId = "mini-standard";
      const go = document.querySelector("#guestOverflow");
      if (go) go.style.display = "none";
      sync();
      fetchBookedDates(state.selectedRoomId);
      roomGrid.scrollIntoView({ behavior: "smooth" });
    });
  }

  renderGroupUI();
}

function renderGroupDefault(container) {
  container.innerHTML = `
    <div style="padding:24px;border:1px solid var(--line);border-radius:8px;background:var(--soft);">
      <p style="margin:0 0 8px;font-weight:800;color:var(--ink);font-size:0.95rem;">Group Booking</p>
      <p style="margin:0 0 14px;color:var(--muted);font-size:0.88rem;line-height:1.5;">Our largest room accommodates 4 adults. For groups of 5 or more, please select your check-in and check-out dates above, then click the button below to check availability.</p>
      <button type="button" id="checkGroupBtn" style="border:1px solid var(--gold);border-radius:8px;background:var(--surface);color:var(--primary);padding:10px 20px;font-size:0.88rem;font-weight:800;cursor:pointer;">Check Room Availability</button>
    </div>`;
  document.getElementById("checkGroupBtn").addEventListener("click", () => {
    if (!checkIn.value || !checkOut.value) {
      showToast("Please select check-in and check-out dates first.");
      return;
    }
    checkGroupAvailability();
  });
}

setInitialDates();
sync();
fetchBookedDates(state.selectedRoomId);

// ===== CHAT ASSISTANT =====

const chatBubble = document.querySelector("#chatBubble");
const chatPanel = document.querySelector("#chatPanel");
const chatClose = document.querySelector("#chatClose");
const chatMessages = document.querySelector("#chatMessages");
const chatInput = document.querySelector("#chatInput");
const chatSend = document.querySelector("#chatSend");

if (chatBubble && chatPanel) {
  chatBubble.addEventListener("click", () => {
    chatPanel.classList.add("open");
    chatBubble.classList.add("hidden");
    chatInput.focus();
  });

  chatClose.addEventListener("click", () => {
    chatPanel.classList.remove("open");
    chatBubble.classList.remove("hidden");
  });

  chatSend.addEventListener("click", sendChatMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  appendChatMsg("user", message);
  chatInput.value = "";
  chatSend.disabled = true;
  chatInput.disabled = true;

  const typingEl = appendTypingIndicator();

  try {
    const response = await fetch(`${CHAT_API}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        checkIn: checkIn.value || null,
        checkOut: checkOut.value || null
      })
    });

    const data = await response.json();
    typingEl.remove();

    if (data.reply) {
      appendChatMsg("bot", data.reply);
    } else {
      appendChatMsg("bot", data.error || "Sorry, I couldn't get a response. Please try again.");
    }
  } catch {
    typingEl.remove();
    appendChatMsg("bot", "Unable to reach the assistant. Please make sure the chat service and Ollama are running.");
  }

  chatSend.disabled = false;
  chatInput.disabled = false;
  chatInput.focus();
}

function appendChatMsg(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "chat-msg-bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrapper;
}

function appendTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-msg bot";
  wrapper.innerHTML = `<div class="chat-typing"><span></span><span></span><span></span></div>`;
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrapper;
}

async function fetchAndShowAISummary(booking) {
  try {
    const response = await fetch(`${CHAT_API}/booking-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestName: booking.name,
        roomType: booking.roomName,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guests: booking.guests,
        total: booking.total,
        nights: booking.nights
      })
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.summary) showBookingSummaryModal(data.summary, booking);
  } catch {
    // AI summary is non-critical — silently skip on failure
  }
}

function showBookingSummaryModal(summary, booking) {
  const modal = document.getElementById("bookingSummaryModal");
  if (!modal) return;
  const nightLabel = booking.nights === 1 ? "night" : "nights";
  document.getElementById("bookingSummaryName").textContent = `Welcome, ${booking.name}!`;
  document.getElementById("bookingSummaryDetails").textContent =
    `${booking.roomName} · ${booking.checkIn} to ${booking.checkOut} · ${booking.nights} ${nightLabel}`;
  document.getElementById("bookingSummaryText").textContent = summary;
  modal.classList.add("open");
}
