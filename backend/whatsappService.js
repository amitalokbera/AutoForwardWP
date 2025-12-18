const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

class WhatsAppForwardService {
    constructor() {
        this.client = null;
        this.trackerNumbers = [];
        this.forwardNumber = null;
        this.lastCheckTime = null;
        this.isRunning = false;
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
        });

        this.client.on('authenticated', () => {
            console.log('Authenticated successfully!');
        });

        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
        });

        this.client.on('disconnected', (reason) => {
            console.log('Client disconnected:', reason);
            this.isRunning = false;
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
        
        const sender = message.from.includes('@c.us') ? message.from : message.author;
        const isFromTracker = this.trackerNumbers.some(num => 
            sender.includes(num) || message.from.includes(num)
        );
        
        return isFromTracker;
    }

    async forwardMessage(message) {
        try {
            const chat = await this.client.getChatById(this.forwardNumber + '@c.us');
            await chat.sendMessage(message.body || message.mediaData?.mimetype || 'Forwarded message');
            console.log(`Forwarded message from ${message.from} to ${this.forwardNumber}`);
        } catch (error) {
            console.error('Error forwarding message:', error);
        }
    }

    setTrackerNumbers(numbers) {
        this.trackerNumbers = numbers;
    }

    setForwardNumber(number) {
        this.forwardNumber = number;
    }

    setLastCheckTime(time) {
        this.lastCheckTime = time;
    }

    getStatus() {
        return {
            isLoggedIn: this.isRunning,
            trackerNumbers: this.trackerNumbers,
            forwardNumber: this.forwardNumber,
            lastCheckTime: this.lastCheckTime
        };
    }
}

module.exports = WhatsAppForwardService;