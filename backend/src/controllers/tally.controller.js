import tallyCompatibilityService from '../services/tallyCompatibility.service.js';
import TallyImport from '../models/TallyImport.js';
import logger from '../config/logger.js';
import fs from 'fs/promises';

class TallyController {
  async exportVouchers(req, res) {
    try {
      const result = await tallyCompatibilityService.exportVouchers({
        ...req.body,
        userId: req.user._id,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async exportMasters(req, res) {
    try {
      const result = await tallyCompatibilityService.exportMasters(req.body.companyId, req.user._id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async exportOpeningBalances(req, res) {
    try {
      const result = await tallyCompatibilityService.exportOpeningBalances(
        req.body.companyId, req.body.financialYear, req.user._id
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async exportGSTData(req, res) {
    try {
      const result = await tallyCompatibilityService.exportGSTData(
        req.body.period, req.body.financialYear, req.user._id
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async importVouchers(req, res) {
    try {
      const result = await tallyCompatibilityService.importVouchers({
        ...req.body,
        userId: req.user._id,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async importMasters(req, res) {
    try {
      const result = await tallyCompatibilityService.importMasters({
        ...req.body,
        userId: req.user._id,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async importFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      const result = await tallyCompatibilityService.ingestFile(req.file.path, ext, {
        userId: req.user._id,
        companyId: req.body.companyId,
        source: 'tally-file-upload',
        createJournals: req.body.createJournals !== 'false',
        importType: req.body.importType || 'vouchers',
      });

      await fs.unlink(req.file.path).catch(() => {});

      res.json({ success: true, data: result });
    } catch (err) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      logger.error('Tally file import error:', err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async importFilePreview(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      let vouchers = [];

      if (ext === 'xml') {
        vouchers = await tallyCompatibilityService.parseTallyXMLFile(req.file.path);
      } else if (ext === 'csv') {
        vouchers = await tallyCompatibilityService.parseTallyCSVFile(req.file.path);
      } else if (ext === 'json') {
        const content = await fs.readFile(req.file.path, 'utf-8');
        const parsed = JSON.parse(content);
        vouchers = Array.isArray(parsed) ? parsed : parsed.vouchers || parsed.data || [];
      } else if (ext === 'xlsx' || ext === 'xls') {
        vouchers = await tallyCompatibilityService.parseExcelFile(req.file.path);
      }

      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        data: {
          fileName: req.file.originalname,
          format: ext,
          totalRecords: vouchers.length,
          preview: vouchers.slice(0, 10),
          vouchers,
        },
      });
    } catch (err) {
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      logger.error('Tally file preview error:', err);
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async validateMigrationReadiness(req, res) {
    try {
      const result = await tallyCompatibilityService.validateMigrationReadiness(req.body.companyId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  async getImportHistory(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const query = {};
      if (req.query.status) query.status = req.query.status;
      if (req.query.importType) query.importType = req.query.importType;

      const [records, total] = await Promise.all([
        TallyImport.find(query)
          .populate('importedBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        TallyImport.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: records,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      logger.error('Get import history error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new TallyController();
