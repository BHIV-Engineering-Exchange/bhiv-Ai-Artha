import express from 'express';
import { protect } from '../middleware/auth.js';
import StorefrontController from '../controllers/storefront.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Process OCR on shop signage image
router.post('/ocr', StorefrontController.processOCR);

// Verify and save storefront information
router.post('/verify', StorefrontController.verifyStorefront);

export default router;
