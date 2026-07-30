import mongoose from 'mongoose';
import User from '../models/User.js';
import logger from '../config/logger.js';

const ALLOWED_ROLES = ['admin', 'accountant', 'viewer'];

function serializeUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : doc;
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department || '',
    status: u.isActive ? 'active' : 'inactive',
    lastLogin: u.lastLogin,
  };
}

/**
 * @desc    Current user profile
 * @route   GET /api/v1/users/me
 */
export const getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user._id,
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        roles: req.user.roles,
        allowedApps: req.user.allowedApps,
      },
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
};

/**
 * @desc    Update current user profile (local fields only)
 * @route   PUT /api/v1/users/me
 */
export const updateMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { name, phone } = req.body;
    if (name !== undefined && String(name).trim()) user.name = String(name).trim();
    if (phone !== undefined) user.phone = String(phone).trim();
    await user.save();
    res.json({ success: true, data: serializeUser(user) });
  } catch (error) {
    logger.error('Update me error:', error);
    res.status(500).json({ success: false, message: 'Could not update profile' });
  }
};

/**
 * @desc    List users
 * @route   GET /api/v1/users
 */
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      count: users.length,
      data: users.map((u) => serializeUser(u)),
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
};

/**
 * @desc    Get user by id
 * @route   GET /api/v1/users/:id
 */
export const getUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: serializeUser(user) });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Error fetching user' });
  }
};

/**
 * @desc    Create user (admin)
 * @route   POST /api/v1/users
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, role, password, department, status } = req.body;
    if (!name || !email || !role || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, role, and password are required',
      });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const user = await User.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      role,
      password,
      department: department ? String(department).trim() : '',
      isActive: status !== 'inactive',
    });
    res.status(201).json({ success: true, data: serializeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    logger.error('Create user error:', error);
    const message = process.env.NODE_ENV === 'production' ? 'Could not create user' : (error.message || 'Could not create user');
    res.status(500).json({ success: false, message });
  }
};

/**
 * @desc    Update user (admin)
 * @route   PUT /api/v1/users/:id
 */
export const updateUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { name, email, role, password, department, status } = req.body;
    if (name !== undefined) user.name = String(name).trim();
    if (email !== undefined) user.email = String(email).trim().toLowerCase();
    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      user.role = role;
    }
    if (department !== undefined) user.department = String(department).trim();
    if (status !== undefined) user.isActive = status !== 'inactive';
    if (password && String(password).length > 0) {
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      }
      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return res.status(400).json({ success: false, message: 'Password must contain uppercase, lowercase, and a number' });
      }
      user.password = password;
    }

    await user.save();
    res.json({ success: true, data: serializeUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    logger.error('Update user error:', error);
    res.status(500).json({ success: false, message: error.message || 'Could not update user' });
  }
};

/**
 * @desc    Delete user (admin)
 * @route   DELETE /api/v1/users/:id
 */
export const deleteUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User removed' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Could not delete user' });
  }
};
