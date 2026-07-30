import CompanySettings from '../models/CompanySettings.js';
import logger from '../config/logger.js';

class CompanySettingsService {
  /**
   * Get company settings (singleton)
   */
  async getSettings() {
    let settings = await CompanySettings.findById('company_settings');
    
    if (!settings) {
      // Create default settings
      settings = await CompanySettings.create({
        _id: 'company_settings',
        companyName: 'ARTHA Finance',
        address: {
          country: 'India',
        },
        gstSettings: {
          isRegistered: true,
          filingFrequency: 'monthly',
        },
        tdsSettings: {
          isTANActive: true,
          autoCalculateTDS: true,
        },
        accountingSettings: {
          financialYearStart: {
            month: 4,
            day: 1,
          },
          baseCurrency: 'INR',
          decimalPlaces: 2,
        },
      });
      
      logger.info('Default company settings created');
    }
    
    return settings;
  }
  
  /**
   * Update company settings
   */
  async updateSettings(updateData) {
    const allowedFields = [
      'companyName', 'address', 'gstin', 'pan', 'tan',
      'gstSettings', 'tdsSettings', 'accountingSettings',
      'logo', 'branding', 'notificationPreferences',
    ];
    const filtered = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filtered[field] = updateData[field];
      }
    }
    const settings = await CompanySettings.findByIdAndUpdate(
      'company_settings',
      filtered,
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    );
    
    logger.info('Company settings updated');
    
    return settings;
  }
  
  /**
   * Get current financial year
   */
  getCurrentFinancialYear() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();
    
    // FY starts in April (month 4)
    if (currentMonth >= 4) {
      return {
        startYear: currentYear,
        endYear: currentYear + 1,
        label: `FY${currentYear}-${(currentYear + 1).toString().slice(-2)}`,
      };
    } else {
      return {
        startYear: currentYear - 1,
        endYear: currentYear,
        label: `FY${currentYear - 1}-${currentYear.toString().slice(-2)}`,
      };
    }
  }
  
  /**
   * Get current quarter
   */
  getCurrentQuarter() {
    const today = new Date();
    const month = today.getMonth() + 1;
    
    if (month >= 4 && month <= 6) return 'Q1';
    if (month >= 7 && month <= 9) return 'Q2';
    if (month >= 10 && month <= 12) return 'Q3';
    return 'Q4';
  }
}

export default new CompanySettingsService();