# Use pre-built wwebjs-api image with all dependencies
FROM avoylenko/wwebjs-api:latest

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json .
RUN npm install

# Create directory for configuration
RUN mkdir -p /app/config

# Copy application code
COPY . .

EXPOSE 3000

# Default volume mount point for configuration persistence
VOLUME ["/app/config"]

CMD ["npm", "start"]