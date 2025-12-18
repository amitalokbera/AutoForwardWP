# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production

# Stage 2: Create the final image
FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["npm", "start"]