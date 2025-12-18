# Use pre-built wwebjs-api image with all dependencies
FROM avoylenko/wwebjs-api:latest

WORKDIR /app

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