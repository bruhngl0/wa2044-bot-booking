import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    step: { type: String, default: "sport_selection" },
    sport: String,
    centre: String,
    date: String, // YYYY-MM-DD
    time_slot: String, // e.g. "11:00 - 12:00"
    name: { type: String, required: true },
    additionalServices: [
      {
        name: String,
        price: Number,
      },
    ],
    players: Number,
    paid: { type: Boolean, default: false },
    calendarEventId: String,
    totalAmount: Number,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true, collection: "bookings" },
);

// Index on phone (non-unique) - for quick user lookup
bookingSchema.index({ phone: 1 });

// Partial unique index: Only enforce uniqueness for PAID bookings
// This allows multiple incomplete bookings but prevents double-booking of paid slots
bookingSchema.index(
  { centre: 1, sport: 1, date: 1, time_slot: 1 },
  {
    unique: true,
    partialFilterExpression: { paid: true },
    name: "unique_paid_slot",
  },
);

const Booking =
  mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

export default Booking;
