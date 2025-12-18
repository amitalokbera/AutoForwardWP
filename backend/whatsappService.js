const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const ConfigManager = require('./configManager');

class WhatsAppForwardService {
    constructor() {
        this.client = null;
        this.configManager = new ConfigManager();
        this.config = this.configManager.getConfig();
        this.startTime = null;
        this.isRunning = false;
        this.connectionInterval = null;
        this.isAuthenticating = false;
        
        // Load config
        this.trackerNumbers = this.config.trackerNumbers;
        this.forwardNumber = this.config.forwardNumber;
        this.startTimeRange = this.config.startTimeRange;
        this.endTimeRange = this.config.endTimeRange;
        this.timezone = this.config.timezone;
        this.countryCode = this.config.countryCode;
    }

    async initialize() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.client.on('qr', (qr) => {
            console.log('QR Code generated, please scan it!');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            console.log('WhatsApp client is ready!');
            this.isRunning = true;
            this.startTime = Date.now();
            this.startConnectionManagement();
        });

        this.client.on('authenticated', () => {
            console.log('Authenticated successfully!');
            this.isAuthenticating = false;
        });

        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
            this.isAuthenticating = false;
        });

        this.client.on('disconnected', (reason) => {
            console.log('Client disconnected:', reason);
            this.isRunning = false;
            this.isAuthenticating = false;
        });

        this.client.on('message', async (message) => {
            if (this.shouldForwardMessage(message)) {
                await this.forwardMessage(message);
            }
        });

        await this.client.initialize();
    }

    shouldForwardMessage(message) {
        if (!this.trackerNumbers.length || !this.forwardNumber) return false;
        
        // Get sender from message.from or message.author
        const sender = message.from || message.author;
        
        // Skip if sender is undefined or invalid
        if (!sender) return false;
        
        // Extract just the phone number from sender (before @c.us)
        const senderNumber = sender.replace('@c.us', '');
        
        // Skip if sender number is empty
        if (!senderNumber) return false;
        
        const isFromTracker = this.trackerNumbers.some(num => 
            senderNumber === num || sender.includes(num)
        );
        
        if (!isFromTracker) return false;

        // Check if current time is within the time range
        if (this.startTimeRange && this.endTimeRange) {
            const now = new Date();
            const options = { timeZone: this.timezone, hour: '2-digit', minute: '2-digit', hour12: false };
            const currentTime = now.toLocaleTimeString('en-US', options);
            
            const [startHour, startMin] = this.startTimeRange.split(':');
            const [endHour, endMin] = this.endTimeRange.split(':');
            const [currentHour, currentMin] = currentTime.split(':');
            
            const startTime = parseInt(startHour) * 60 + parseInt(startMin);
            const endTime = parseInt(endHour) * 60 + parseInt(endMin);
            const currentTimeInMinutes = parseInt(currentHour) * 60 + parseInt(currentMin);
            
            if (startTime <= endTime) {
                return currentTimeInMinutes >= startTime && currentTimeInMinutes <= endTime;
            } else {
                // Time range crosses midnight
                return currentTimeInMinutes >= startTime || currentTimeInMinutes <= endTime;
            }
        }
        
        return true;
    }

    async forwardMessage(message) {
        try {
            // Format the forward number with country code
            const formattedNumber = this.countryCode + this.forwardNumber;
            const chat = await this.client.getChatById(formattedNumber + '@c.us');
            
            // Check if message has media/attachment
            if (message.hasMedia) {
                try {
                    // Download the media from the original message
                    const media = await message.downloadMedia();
                    
                    // Forward the media with caption if available
                    const caption = message.body || '';
                    await chat.sendMessage(media, null, { caption: caption });
                    console.log(`Forwarded media from ${message.from} to ${this.forwardNumber}`);
                } catch (mediaError) {
                    console.error('Error forwarding media, sending text instead:', mediaError);
                    // Fallback: send as text if media download fails
                    await chat.sendMessage(`[Attachment] ${message.body || 'Media forwarded (unable to download)'}`);
                }
            } else {
                // Forward text message
                await chat.sendMessage(message.body || 'Forwarded message');
                console.log(`Forwarded message from ${message.from} to ${this.forwardNumber}`);
            }
        } catch (error) {
            console.error('Error forwarding message:', error);
        }
    }

    async checkAndManageConnection() {
        if (!this.startTimeRange || !this.endTimeRange) return;

        const now = new Date();
        const options = { timeZone: this.timezone, hour: '2-digit', minute: '2-digit', hour12: false };
        const currentTime = now.toLocaleTimeString('en-US', options);
        
        const [startHour, startMin] = this.startTimeRange.split(':');
        const [endHour, endMin] = this.endTimeRange.split(':');
        const [currentHour, currentMin] = currentTime.split(':');
        
        const startTime = parseInt(startHour) * 60 + parseInt(startMin);
        const endTime = parseInt(endHour) * 60 + parseInt(endMin);
        const currentTimeInMinutes = parseInt(currentHour) * 60 + parseInt(currentMin);

        const isInTimeRange = startTime <= endTime 
            ? currentTimeInMinutes >= startTime && currentTimeInMinutes <= endTime
            : currentTimeInMinutes >= startTime || currentTimeInMinutes <= endTime;

        if (isInTimeRange && !this.isRunning && !this.isAuthenticating) {
            console.log('Time range active, connecting WhatsApp client...');
            this.isAuthenticating = true;
            try {
                await this.client.connect();
                console.log('WhatsApp client connected successfully');
            } catch (error) {
                console.error('Error connecting WhatsApp client:', error);
                this.isAuthenticating = false;
            }
        } else if (!isInTimeRange && this.isRunning) {
            console.log('Time range inactive, disconnecting WhatsApp client...');
            try {
                await this.client.disconnect();
                console.log('WhatsApp client disconnected successfully');
            } catch (error) {
                console.error('Error disconnecting WhatsApp client:', error);
            }
        }
    }

    startConnectionManagement() {
        // Clear any existing interval
        if (this.connectionInterval) {
            clearInterval(this.connectionInterval);
        }

        // Check connection every minute
        this.connectionInterval = setInterval(() => {
            this.checkAndManageConnection();
        }, 60000); // 1 minute

        // Initial check
        this.checkAndManageConnection();
    }

    setTrackerNumbers(numbers) {
        // Prepend country code to each tracker number
        this.trackerNumbers = numbers.map(num => this.countryCode + num);
        this.config.trackerNumbers = this.trackerNumbers;
        this.configManager.saveConfig();
    }

    setForwardNumber(number) {
        this.forwardNumber = number;
        this.config.forwardNumber = number;
        this.configManager.saveConfig();
    }

    setStartTimeRange(time) {
        this.startTimeRange = time;
        this.config.startTimeRange = time;
        this.configManager.saveConfig();
        // Trigger connection check when time range changes
        if (this.isRunning) {
            this.checkAndManageConnection();
        }
    }

    setEndTimeRange(time) {
        this.endTimeRange = time;
        this.config.endTimeRange = time;
        this.configManager.saveConfig();
        // Trigger connection check when time range changes
        if (this.isRunning) {
            this.checkAndManageConnection();
        }
    }

    setTimezone(timezone) {
        this.timezone = timezone;
        this.config.timezone = timezone;
        this.configManager.saveConfig();
        // Trigger connection check when timezone changes
        if (this.isRunning) {
            this.checkAndManageConnection();
        }
    }

    setCountryCode(code) {
        this.countryCode = code;
        this.config.countryCode = code;
        this.configManager.saveConfig();
        // Re-format tracker numbers with new country code
        if (this.trackerNumbers.length > 0) {
            // Remove old country code prefix if it exists
            const oldCode = this.trackerNumbers[0].match(/^\d+/);
            const stripNumbers = oldCode ? this.trackerNumbers.map(num => num.substring(oldCode[0].length)) : this.trackerNumbers;
            this.setTrackerNumbers(stripNumbers);
        }
    }

    testConnection() {
        return {
            isConnected: this.isRunning,
            uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000 / 60) : 0, // minutes
            trackerNumbers: this.trackerNumbers,
            forwardNumber: this.forwardNumber,
            timeRange: { start: this.startTimeRange, end: this.endTimeRange },
            timezone: this.timezone,
            countryCode: this.countryCode
        };
    }

    getStatus() {
        return {
            isLoggedIn: this.isRunning,
            trackerNumbers: this.trackerNumbers,
            forwardNumber: this.forwardNumber,
            startTimeRange: this.startTimeRange,
            endTimeRange: this.endTimeRange,
            timezone: this.timezone,
            countryCode: this.countryCode,
            uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000 / 60) : 0, // minutes
            isAuthenticating: this.isAuthenticating
        };
    }
}

module.exports = WhatsAppForwardService;