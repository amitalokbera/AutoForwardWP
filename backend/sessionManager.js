/**
 * SessionManager - Handles persistent WhatsApp session storage with encryption
 * This prevents the need to re-scan QR codes on every restart
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SessionManager {
    constructor(dataPath = null) {
        // Determine auth directory based on environment
        const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_ENV === 'true';
        this.dataPath = dataPath || (isDocker
            ? '/app/whatsapp_auth'
            : path.join(process.cwd(), '.wwebjs_auth'));

        this.sessionStorePath = path.join(this.dataPath, 'session_tokens.enc');
        this.encryptionKey = this.getOrCreateEncryptionKey();

        // Ensure data directory exists
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }
    }

    /**
     * Get or create a persistent encryption key for session data
     * This key is stored in a .env file or environment variable
     */
    getOrCreateEncryptionKey() {
        const keyFile = path.join(this.dataPath, '.session_key');

        // Try to use environment variable first
        if (process.env.SESSION_ENCRYPTION_KEY) {
            return Buffer.from(process.env.SESSION_ENCRYPTION_KEY, 'hex');
        }

        // Try to read from file
        if (fs.existsSync(keyFile)) {
            try {
                const key = fs.readFileSync(keyFile, 'utf-8').trim();
                return Buffer.from(key, 'hex');
            } catch (error) {
                console.warn('Failed to read encryption key from file:', error.message);
            }
        }

        // Generate new key if none exists
        const newKey = crypto.randomBytes(32);
        try {
            fs.writeFileSync(keyFile, newKey.toString('hex'), { mode: 0o600 });
            console.log('Generated new session encryption key');
        } catch (error) {
            console.warn('Failed to write encryption key to file:', error.message);
        }

        return newKey;
    }

    /**
     * Save session data encrypted
     * @param {Object} sessionData - The session data to save
     */
    saveSession(sessionData) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

            let encrypted = cipher.update(JSON.stringify(sessionData), 'utf-8', 'hex');
            encrypted += cipher.final('hex');

            const data = {
                iv: iv.toString('hex'),
                data: encrypted,
                timestamp: new Date().toISOString()
            };

            fs.writeFileSync(this.sessionStorePath, JSON.stringify(data), { mode: 0o600 });
            console.log('Session data saved and encrypted');
            return true;
        } catch (error) {
            console.error('Error saving session:', error);
            return false;
        }
    }

    /**
     * Load and decrypt session data
     * @returns {Object|null} - The decrypted session data or null if not found
     */
    loadSession() {
        try {
            if (!fs.existsSync(this.sessionStorePath)) {
                console.log('No saved session found');
                return null;
            }

            const fileData = JSON.parse(fs.readFileSync(this.sessionStorePath, 'utf-8'));
            const iv = Buffer.from(fileData.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

            let decrypted = decipher.update(fileData.data, 'hex', 'utf-8');
            decrypted += decipher.final('utf-8');

            const sessionData = JSON.parse(decrypted);
            console.log('Session data loaded and decrypted successfully');
            return sessionData;
        } catch (error) {
            console.error('Error loading session:', error.message);
            return null;
        }
    }

    /**
     * Clear saved session data
     */
    clearSession() {
        try {
            if (fs.existsSync(this.sessionStorePath)) {
                fs.unlinkSync(this.sessionStorePath);
                console.log('Session data cleared');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error clearing session:', error);
            return false;
        }
    }

    /**
     * Check if a valid session exists
     * @returns {boolean}
     */
    hasValidSession() {
        return fs.existsSync(this.sessionStorePath);
    }

    /**
     * Get session metadata (timestamp, etc.)
     */
    getSessionMetadata() {
        try {
            if (!fs.existsSync(this.sessionStorePath)) {
                return null;
            }

            const fileData = JSON.parse(fs.readFileSync(this.sessionStorePath, 'utf-8'));
            return {
                timestamp: fileData.timestamp,
                exists: true
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Backup session data
     * @param {string} backupPath - Optional custom backup path
     */
    backupSession(backupPath = null) {
        try {
            if (!fs.existsSync(this.sessionStorePath)) {
                console.log('No session to backup');
                return false;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const destination = backupPath || path.join(this.dataPath, `session_backup_${timestamp}.enc`);

            fs.copyFileSync(this.sessionStorePath, destination);
            console.log(`Session backed up to: ${destination}`);
            return true;
        } catch (error) {
            console.error('Error backing up session:', error);
            return false;
        }
    }

    /**
     * Restore session from backup
     * @param {string} backupPath - Path to the backup file
     */
    restoreSession(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                console.error('Backup file not found:', backupPath);
                return false;
            }

            fs.copyFileSync(backupPath, this.sessionStorePath);
            console.log('Session restored from backup');
            return true;
        } catch (error) {
            console.error('Error restoring session:', error);
            return false;
        }
    }
}

module.exports = SessionManager;
