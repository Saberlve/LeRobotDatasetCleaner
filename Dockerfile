FROM node:20-bookworm-slim AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose port 7860
EXPOSE 7860

# Set environment variable for port
ENV PORT=7860

# Start the application
CMD ["npm", "run", "start"]
