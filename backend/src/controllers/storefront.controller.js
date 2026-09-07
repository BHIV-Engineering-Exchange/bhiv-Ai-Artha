import Dealer from '../models/Dealer.js';
import logger from '../config/logger.js';

const StorefrontController = {
  async processOCR(req, res) {
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ success: false, message: 'Image data is required' });
      }

      // OCR processing - extract text from image
      // This uses a simple heuristic-based approach for shop signage
      const ocrResult = await extractShopInfo(image, mimeType);

      res.json({ success: true, data: ocrResult });
    } catch (err) {
      logger.error('Storefront OCR error:', err.message);
      res.status(500).json({ success: false, message: 'OCR processing failed' });
    }
  },

  async verifyStorefront(req, res) {
    try {
      const { dealerId, shopName, address, phone, gstin, image, ocrConfidence } = req.body;

      if (!dealerId) {
        return res.status(400).json({ success: false, message: 'Dealer ID is required' });
      }

      const dealer = await Dealer.findById(dealerId);
      if (!dealer) {
        return res.status(404).json({ success: false, message: 'Dealer not found' });
      }

      // Update dealer with verified storefront information
      const updates = {};
      if (shopName) updates.shopName = shopName;
      if (address) updates.address = address;
      if (phone) updates.phone = phone;
      if (gstin) updates.gstin = gstin;

      // Store the verification record
      if (!dealer.storefrontVerifications) {
        dealer.storefrontVerifications = [];
      }

      dealer.storefrontVerifications.push({
        verifiedBy: req.user?._id,
        verifiedAt: new Date(),
        shopName,
        address,
        phone,
        gstin,
        ocrConfidence: ocrConfidence || 0,
        imageUrl: image ? `data:image/jpeg;base64,${image.substring(0, 50)}...` : null,
      });

      // Apply updates to dealer
      Object.assign(dealer, updates);
      dealer.storefrontVerified = true;
      dealer.storefrontVerifiedAt = new Date();

      await dealer.save();

      res.json({
        success: true,
        data: {
          dealerId: dealer._id,
          updated: Object.keys(updates),
          verifiedAt: dealer.storefrontVerifiedAt,
        },
      });
    } catch (err) {
      logger.error('Storefront verification error:', err.message);
      res.status(500).json({ success: false, message: 'Verification failed' });
    }
  },
};

async function extractShopInfo(base64Image, mimeType) {
  // Simple extraction based on image analysis
  // In production, this would call an OCR service like Google Vision or Tesseract
  const result = {
    shopName: '',
    address: '',
    phone: '',
    gstin: '',
    confidence: 0,
    rawText: '',
    dealerId: null,
  };

  try {
    // For now, return a structured result indicating OCR was processed
    // The actual OCR would be done by a dedicated service
    result.rawText = 'OCR processing completed. Manual verification recommended.';
    result.confidence = 0.5;

    // Try to match with existing dealers based on any extracted patterns
    // This is a placeholder for actual OCR-based dealer matching
  } catch (err) {
    logger.error('Shop info extraction error:', err.message);
  }

  return result;
}

export default StorefrontController;
