import User from '../models/User.js';
import logger from '../config/logger.js';
import { signAccessToken } from '../utils/authToken.js';
import { getBlackholeCookieOptions, clearBlackholeCookie } from '../middleware/auth.js';

const COOKIE_NAME = 'blackhole_token';

function getCookieOptions() {
  return getBlackholeCookieOptions();
}

export const login = async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email, isActive: true }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signAccessToken(user);

    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          roles: [user.role],
        },
      },
    });
  } catch (err) {
    logger.error('login:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
};

export const signup = async (req, res) => {
  try {
    const name = (req.body?.name || '').trim();
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    const phone = (req.body?.phone || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, message: 'Password must contain uppercase, lowercase, and a number' });
    }

    const existing = await User.findOne({ email }).select('_id');
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone: phone || undefined,
      role: 'viewer',
      isActive: true,
    });

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = signAccessToken(user);

    res.cookie(COOKIE_NAME, token, getCookieOptions());

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          roles: [user.role],
        },
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }
    logger.error('signup:', err.message);
    return res.status(500).json({ success: false, message: 'Signup failed' });
  }
};

export const logout = async (req, res) => {
  clearBlackholeCookie(res);
  return res.json({ success: true, message: 'Logged out' });
};
