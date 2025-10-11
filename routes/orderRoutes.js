const express = require('express');
const Order = require('../models/Order');
const { auth, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Create order with images (authenticated users)
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { name, address, price, phoneNumber, details } = req.body;

    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image is required' });
    }

    // Get image paths
    const imagePaths = req.files.map(file => `/uploads/${file.filename}`);

    const order = new Order({
      name,
      images: imagePaths,
      address,
      price,
      phoneNumber,
      details,
      userId: req.user._id
    });

    await order.save();
    res.status(201).json({ 
      message: 'Order created successfully', 
      order 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error creating order', 
      error: error.message 
    });
  }
});

// Get all orders (admin only)
router.get('/all', auth, isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
});

// Get user's own orders
router.get('/my-orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
});

// Get single order by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Users can only see their own orders, admins can see all
    if (req.user.role !== 'admin' && order.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ order });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error fetching order', 
      error: error.message 
    });
  }
});

// Update order status (admin only)
router.patch('/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order status updated', order });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error updating order', 
      error: error.message 
    });
  }
});

// Delete order (admin only)
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error deleting order', 
      error: error.message 
    });
  }
});

module.exports = router;
