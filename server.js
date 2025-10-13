const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");

const app = express();

const apiLogger = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  // Log the incoming request
  console.log(
    `📥 [API CALL] ${req.method} ${
      req.originalUrl
    } at ${new Date().toISOString()}`
  );

  // Intercept the response before sending
  res.send = function (body) {
    const duration = Date.now() - start;
    console.log(
      `📤 [API RESPONSE] ${req.method} ${req.originalUrl} (${duration}ms)`
    );

    try {
      // If response is JSON, log parsed data
      const parsed = JSON.parse(body);
      console.log("🧾 Response Data:", parsed);
    } catch (e) {
      // Otherwise log as text
      console.log("🧾 Response Text:", body);
    }

    // Call the original send method
    return originalSend.call(this, body);
  };

  next();
};

app.use(apiLogger);
// Middleware
// Allow requests from the frontend and allow credentials (cookies) to be sent.
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Ensure preflight requests are handled for all routes
app.options("*", cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files - Make uploads folder accessible
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);

// Home route
app.get("/", (req, res) => {
  res.json({ message: "Order Management API with Image Upload is running" });
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
