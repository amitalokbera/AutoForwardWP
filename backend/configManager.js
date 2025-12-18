const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        // Use volume-mounted config directory
        this.configDir = '/app/config';
        this.configPath = path.join(this.configDir, 'config.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
        return {
            trackerNumbers: [],
            forwardNumber: '',
            startTimeRange: '',
            endTimeRange: '',
            timezone: 'UTC',
            countryCode: '91'
        };
    }

    saveConfig() {
        try {
            // Ensure config directory exists
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    setTrackerNumbers(numbers) {
        this.config.trackerNumbers = numbers;
        this.saveConfig();
    }

    setForwardNumber(number) {
        this.config.forwardNumber = number;
        this.saveConfig();
    }

    setStartTimeRange(time) {
        this.config.startTimeRange = time;
        this.saveConfig();
    }

    setEndTimeRange(time) {
        this.config.endTimeRange = time;
        this.saveConfig();
    }

    setTimezone(timezone) {
        this.config.timezone = timezone;
        this.saveConfig();
    }

    setCountryCode(code) {
        this.config.countryCode = code;
        this.saveConfig();
    }

    getConfig() {
        return this.config;
    }
}

module.exports = ConfigManager;