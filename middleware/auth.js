const jwt = require("jsonwebtoken");
const User = require("../models/User");

// helper: extract token from Authorization header or cookie header
const extractToken = (req) => {
  // Check Authorization header first
  const authHeader = req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  // Fallback: parse token from cookie header (if present)
  const cookieHeader = req.header("cookie") || req.header("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const c of cookies) {
      const [name, ...rest] = c.split("=");
      if (name === "token") {
        return rest.join("=");
      }
    }
  }

  return null;
};

// Verify JWT token
const auth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Check admin role
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

module.exports = { auth, isAdmin };
