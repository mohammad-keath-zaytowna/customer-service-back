const mongoose = require("mongoose");
const Counter = require("./Counter");

const orderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    images: [
      {
        type: String,
        required: true,
      },
    ],
    invoice_no: {
      type: String,
      unique: true,
      sparse: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    details: {
      type: String,
      required: [true, "Details are required"],
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "cancelled"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.pre("save", async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: "order_invoice_no" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.invoice_no = counter.seq;
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
