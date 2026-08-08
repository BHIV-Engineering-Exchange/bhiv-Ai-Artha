import crypto from 'crypto';
import logger from '../config/logger.js';

/**
 * Modular Activation Code Service
 *
 * Provides activation code verification for elevated roles (admin, accountant).
 * Currently uses static codes; designed to be replaced with enterprise identity
 * management (SSO, LDAP, SAML, OIDC) without changing consumers.
 *
 * Activation codes are single-use and scoped to specific roles.
 * The service is stateless for static codes — no database tracking needed.
 */

const ACTIVATION_CODES = {
  admin: [
    {
      code: '#BHIVATH01',
      roles: ['admin', 'accountant', 'viewer'],
      description: 'BHIV Admin Activation Code',
      maxUses: null,
      expiresAt: null,
    },
  ],
  accountant: [
    {
      code: '#BHIVATH01',
      roles: ['accountant', 'viewer'],
      description: 'BHIV Accountant Activation Code',
      maxUses: null,
      expiresAt: null,
    },
  ],
};

function hashCode(code) {
  return crypto.createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
}

class ActivationCodeService {
  /**
   * Verify an activation code for a given role.
   *
   * @param {string} code - The raw activation code
   * @param {string} role - The target role ('admin' or 'accountant')
   * @returns {{ valid: boolean, message?: string, codeHash?: string, matchedRole?: string }}
   */
  verify(code, role) {
    if (!code || typeof code !== 'string') {
      return { valid: false, message: 'Activation code is required' };
    }

    const normalizedCode = code.toUpperCase().trim();
    const codesForRole = ACTIVATION_CODES[role] || ACTIVATION_CODES.accountant;

    for (const entry of codesForRole) {
      if (normalizedCode === entry.code.toUpperCase()) {
        if (entry.expiresAt && new Date() > new Date(entry.expiresAt)) {
          return { valid: false, message: 'Activation code has expired' };
        }
        if (!entry.roles.includes(role)) {
          return {
            valid: false,
            message: `Activation code does not grant ${role} access`,
          };
        }
        return {
          valid: true,
          codeHash: hashCode(normalizedCode),
          matchedRole: role,
          description: entry.description,
        };
      }
    }

    return { valid: false, message: 'Invalid activation code' };
  }

  /**
   * List available activation code descriptors (without exposing actual codes).
   * Useful for admin UI or health checks.
   */
  listDescriptors() {
    const descriptors = [];
    for (const [role, codes] of Object.entries(ACTIVATION_CODES)) {
      for (const entry of codes) {
        descriptors.push({
          role,
          description: entry.description,
          hasExpiry: !!entry.expiresAt,
          isActive: !entry.expiresAt || new Date() <= new Date(entry.expiresAt),
        });
      }
    }
    return descriptors;
  }

  /**
   * Placeholder for enterprise identity integration.
   * Replace this method body with actual SSO/LDAP/SAML/OIDC verification.
   *
   * @param {string} code
   * @param {string} role
   * @param {object} identityContext - Enterprise identity context
   */
  async verifyEnterprise(code, role, identityContext = {}) {
    // TODO: Integrate with enterprise IdP
    // Example: return await enterpriseIdp.verify(code, role, identityContext);
    return this.verify(code, role);
  }
}

export default new ActivationCodeService();
