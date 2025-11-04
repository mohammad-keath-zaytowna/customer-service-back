const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { auth, isAdmin } = require("../middleware/auth");

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const user = new User({ name, email, password, role });
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
});

// Auth route for frontend sign-up (compatibility with ecommerce-admin)
router.post("/auth/sign-up", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const user = new User({ name, email, password, role });
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Set HttpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "none",
    });

    res.status(201).json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (user.blocked) {
      return res.status(403).json({ message: "User is blocked" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in", error: error.message });
  }
});

// Auth route for frontend sign-in (compatibility with ecommerce-admin)
router.post("/auth/sign-in", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ errors: { email: "Invalid credentials" } });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ errors: { password: "Invalid credentials" } });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Also return token in response body for clients that prefer Bearer auth
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ errors: { general: "Error logging in" } });
  }
});

// Get current user
router.get("/me", auth, async (req, res) => {
  res.json({ user: req.user, token: req.token });
});

// List all users (admin only)
router.get("/", auth, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {
      role: "user",
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }, // optional if you have a phone field
      ],
    };

    const totalItems = await User.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    const skip = (page - 1) * limit;

    const users = await User.find(query)
      .select("-password")
      .limit(limit)
      .skip(skip)
      .sort({ createdAt: -1 }); // optional: newest first

    res.json({
      data: users,
      pagination: {
        current: page,
        limit,
        items: totalItems,
        pages: totalPages,
        prev: page > 1 ? page - 1 : null,
        next: page < totalPages ? page + 1 : null,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching users", error: error.message });
  }
});

// Delete user (admin only)
router.delete("/:id", auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting user", error: error.message });
  }
});

// Update user (admin only)
router.patch("/:id", auth, isAdmin, async (req, res) => {
  try {
    const updates = {};
    const allowed = ["name", "email", "phone", "role", "blocked"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating user", error: error.message });
  }
});

router.post("/auth/sign-out", auth, (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none",
    expires: new Date(0),
  });

  res.json({ success: true });
});

module.exports = router;
