const express = require("express");
const Order = require("../models/Order");
const { auth, isAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");
const { uploadToS3, getFileUrl } = require("../utils/s3");
const { isValidObjectId } = require("mongoose");

const router = express.Router();

// Create order with images (authenticated users)
router.post("/", auth, upload.array("images", 5), async (req, res) => {
  try {
    const { name, address, price, phoneNumber, details } = req.body;
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one image is required" });
    }

    // Upload files to S3 and build image URLs
    try {
      const uploadPromises = req.files.map((file) => uploadToS3(file));
      const uploadedKeys = await Promise.all(uploadPromises);

      // Build S3 public URLs (assumes bucket objects are publicly readable).
      // If your bucket is private, consider storing the key and using signed URLs when serving.
      const region = process.env.BUCKET_REGION;
      const bucket = process.env.BUCKET_NAME;
      const imagePaths = uploadedKeys.map(
        (key) => `https://${bucket}.s3.${region}.amazonaws.com/${key}`
      );

      const order = new Order({
        name,
        images: imagePaths,
        address,
        price,
        phoneNumber,
        details,
        userId: req.user._id,
      });

      await order.save();
      return res.status(201).json({
        message: "Order created successfully",
        order,
      });
    } catch (s3Error) {
      console.error("S3 upload error:", s3Error);
      return res.status(500).json({
        message: "Error uploading images to S3",
        error: s3Error.message,
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "Error creating order",
      error: error.message,
    });
  }
});

// Get all orders (admin only)
router.get("/all", auth, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const status = req.query.status || "";
    const method = req.query.method || "";
    const startDate = req.query.startDate || "";
    const endDate = req.query.endDate || "";
    const userId = req.query.userId || "";

    // 🧱 Build query object
    const query = {};

    if (status) query.status = status;
    if (method) query.payment_method = method;
    if (userId && isValidObjectId(userId)) query.userId = userId;

    // 🕒 Date filters
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1); // include end date fully
        query.createdAt.$lt = end;
      }
    }

    // 🔍 Search (by user name or email)
    let userIds = [];
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      userIds = users.map((u) => u._id);
      // add to query
      query.$or = [
        { userId: { $in: userIds } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    // 🧮 Count total
    const totalItems = await Order.countDocuments({
      ...query,
    });

    const totalPages = Math.ceil(totalItems / limit);
    const skip = (page - 1) * limit;

    // 📦 Fetch orders with filters + pagination
    const orders = await Order.find({
      ...query,
    })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // ✅ Response format
    res.json({
      data: orders,
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
    console.error("Error fetching orders:", error.message);
    res.status(500).json({
      message: "Error fetching orders",
      error: error.message,
    });
  }
});

// Get user's own orders
router.get("/my-orders", auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching orders",
      error: error.message,
    });
  }
});

// Get single order by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "userId",
      "name email"
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Users can only see their own orders, admins can see all
    if (
      req.user.role !== "admin" &&
      order.userId._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    order.images = order.images.map((image) => getFileUrl(image));

    res.json({ order });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching order",
      error: error.message,
    });
  }
});

// Update order status (admin only)
router.patch("/:id/status", auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ message: "Order status updated", order });
  } catch (error) {
    res.status(500).json({
      message: "Error updating order",
      error: error.message,
    });
  }
});

// Delete order (admin only)
router.delete("/:id", auth, isAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting order",
      error: error.message,
    });
  }
});
// Update order fields (admin only, no images)
router.patch("/:id", auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    // نسمح فقط بهالحقلان (ما منقرب على images, invoice_no, userId)
    const { name, address, price, phoneNumber, details, status } = req.body;

    // status حسب السكيمة تبعك
    const allowedStatuses = ["pending", "processing", "completed", "cancelled"];
    if (status !== undefined && !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // منبني الداتا يلي رح نحدّثها بس من الحقول المسموحة
    const updateDoc = {};
    if (name !== undefined) updateDoc.name = String(name).trim();
    if (address !== undefined) updateDoc.address = String(address).trim();

    if (price !== undefined) {
      const num = Number(price);
      if (Number.isNaN(num) || num < 0) {
        return res.status(400).json({ message: "Invalid price" });
      }
      updateDoc.price = num;
    }

    if (phoneNumber !== undefined)
      updateDoc.phoneNumber = String(phoneNumber).trim();
    if (details !== undefined) updateDoc.details = String(details).trim();
    if (status !== undefined) updateDoc.status = status;

    // تجاهُل أي محاولة لتعديل الصور/الفواتير/المستخدم
    if (
      "images" in req.body ||
      "invoice_no" in req.body ||
      "userId" in req.body
    ) {
      // ممكن ترجع تحذير لطيف، بس هون عم نتجاهل بصمت
    }

    const updated = await Order.findByIdAndUpdate(id, updateDoc, {
      new: true,
      runValidators: true, // حتى enum/min/required الجزئية تتطبق
    }).populate("userId", "name email");

    if (!updated) {
      return res.status(404).json({ message: "Order not found" });
    }

    // بس للرد: منحوّل الصور لروابط جاهزة (بدون تعديل بالـ DB)
    const orderObj = updated.toObject();
    orderObj.images = (orderObj.images || []).map((img) => getFileUrl(img));

    return res.json({ message: "Order updated", order: orderObj });
  } catch (error) {
    console.error("Error updating order:", error);
    return res.status(500).json({
      message: "Error updating order",
      error: error.message,
    });
  }
});
module.exports = router;
