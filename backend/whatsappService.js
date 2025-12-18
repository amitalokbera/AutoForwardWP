const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
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

    hasSavedSession() {
        // Determine auth directory based on environment
        const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_ENV === 'true';
        const authDir = isDocker 
            ? '/app/whatsapp_auth' 
            : path.join(process.cwd(), '.wwebjs_auth');
        
        try {
            // Check if auth directory exists
            if (!fs.existsSync(authDir)) {
                console.log(`Auth directory does not exist: ${authDir}`);
                return false;
            }
            
            // List all contents in the auth directory recursively to find session files
            const files = this.getAllFiles(authDir);
            const hasSession = files.length > 0;
            console.log(`Session files found in ${authDir}: ${hasSession}`);
            console.log(`Total files in auth directory: ${files.length}`);
            return hasSession;
        } catch (error) {
            console.error('Error checking saved session:', error);
            return false;
        }
    }
    
    getAllFiles(dir) {
        const files = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...this.getAllFiles(fullPath));
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't be read
        }
        return files;
    }

    async initialize() {
        // Determine auth directory based on environment
        const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER_ENV === 'true';
        const authDir = isDocker 
            ? '/app/whatsapp_auth' 
            : path.join(process.cwd(), '.wwebjs_auth');
        
        // Ensure auth directory exists
        if (!fs.existsSync(authDir)) {
            fs.mkdirSync(authDir, { recursive: true });
        }
        
        console.log(`Using auth directory: ${authDir}`);
        
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: 'whatsapp-forward', dataPath: authDir }),
            puppeteer: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.client.on('qr', (qr) => {
            console.log('QR Code generated, please scan it!');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('ready', () => {
            console.log('WhatsApp client is ready!');
            this.isRunning = true;
            this.isAuthenticating = false;
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

        console.log('Initializing WhatsApp client...');
        this.isAuthenticating = true;
        
        try {
            await this.client.initialize();
            console.log('WhatsApp client initialized successfully');
        } catch (error) {
            console.error('Error initializing WhatsApp client:', error);
            this.isAuthenticating = false;
            throw error;
        }
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
            const formattedNumber = this.countryCode + this.forwardNumber + '@c.us';
            
            // Try to get or create the chat
            let chat = null;
            try {
                // First, try to get existing chat
                chat = await this.client.getChatById(formattedNumber);
            } catch (e) {
                try {
                    // If chat doesn't exist, try to get the contact and create chat
                    const contact = await this.client.getContactById(formattedNumber);
                    chat = await contact.getChat();
                } catch (contactError) {
                    console.log(`Chat/Contact not found, will attempt direct message send for ${formattedNumber}`);
                }
            }
            
            // Check if message has media/attachment
            if (message.hasMedia) {
                try {
                    // Download the media from the original message
                    const media = await message.downloadMedia();
                    
                    if (chat) {
                        // Send media with the message body as caption
                        if (message.body) {
                            await chat.sendMessage(media, null, { caption: message.body });
                        } else {
                            await chat.sendMessage(media);
                        }
                    } else {
                        // Get contact and send media
                        const contact = await this.client.getContactById(formattedNumber);
                        if (message.body) {
                            await contact.sendMessage(media, { caption: message.body });
                        } else {
                            await contact.sendMessage(media);
                        }
                    }
                    console.log(`Forwarded media from ${message.from} to ${this.forwardNumber}`);
                } catch (mediaError) {
                    console.error('Error forwarding media, sending text instead:', mediaError);
                    // Fallback: send as text if media download fails
                    const fallbackMessage = `[Attachment] ${message.body || 'Media forwarded (unable to download)'}`;
                    try {
                        if (chat) {
                            await chat.sendMessage(fallbackMessage);
                        } else {
                            const contact = await this.client.getContactById(formattedNumber);
                            await contact.sendMessage(fallbackMessage);
                        }
                    } catch (sendError) {
                        console.error('Error sending fallback message:', sendError);
                    }
                }
            } else {
                // Forward text message
                const textMessage = message.body || 'Forwarded message';
                try {
                    if (chat) {
                        await chat.sendMessage(textMessage);
                    } else {
                        const contact = await this.client.getContactById(formattedNumber);
                        await contact.sendMessage(textMessage);
                    }
                    console.log(`Forwarded message from ${message.from} to ${this.forwardNumber}`);
                } catch (sendError) {
                    console.error('Error sending text message:', sendError);
                }
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
            hasSavedSession: this.hasSavedSession(),
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