# Use Node.js LTS as base image
FROM node:18-bullseye

WORKDIR /app

# Install Chromium and required dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    libxtst6 \
    ca-certificates \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libgbm1 \
    libnss3 \
    libxshmfence1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Create directories for configuration and WhatsApp authentication
RUN mkdir -p /app/config /app/whatsapp_auth

# Copy application code
COPY . .

EXPOSE 3000

# Volume mount points for persistence
# /app/config - for application configuration (tracker numbers, forward number, etc.)
# /app/whatsapp_auth - for WhatsApp session data (authentication persistence)
VOLUME ["/app/config", "/app/whatsapp_auth"]

CMD ["npm", "start"]