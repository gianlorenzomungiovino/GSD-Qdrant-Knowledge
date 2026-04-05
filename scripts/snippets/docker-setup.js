#!/usr/bin/env node

/**
 * Docker Setup Script
 * 
 * This script sets up Docker configuration for the project.
 * It creates necessary Dockerfiles and docker-compose.yml files.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();

/**
 * Create Dockerfile for Node.js application
 */
function createDockerfile() {
  const dockerfile = `
# Dockerfile for Node.js application
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "scripts/cli.js"]
`;

  const dockerfilePath = path.join(PROJECT_ROOT, 'Dockerfile');
  fs.writeFileSync(dockerfilePath, dockerfile, 'utf8');
  console.log('✅ Created Dockerfile');
}

/**
 * Create docker-compose.yml
 */
function createDockerCompose() {
  const compose = `
# Docker Compose configuration
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: gsd-qdrant-app
    restart: unless-stopped
    working_dir: /app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ./scripts:/app/scripts
    networks:
      - gsd-network

networks:
  gsd-network:
    driver: bridge
`;

  const composePath = path.join(PROJECT_ROOT, 'docker-compose.yml');
  fs.writeFileSync(composePath, compose, 'utf8');
  console.log('✅ Created docker-compose.yml');
}

/**
 * Create .dockerignore
 */
function createDockerIgnore() {
  const ignore = `
# Ignore node_modules
node_modules/

# Ignore logs
logs/
*.log
npm-debug.log*

# Ignore dist
dist/

# Ignore .git
.git/
.gitignore

# Ignore IDE files
.idea/
.vscode/

# Ignore test files
tests/
__tests__/

# Ignore .env files
.env
.env.local
.env.*.local

# Ignore coverage
coverage/

# Ignore .DS_Store
.DS_Store
`;

  const ignorePath = path.join(PROJECT_ROOT, '.dockerignore');
  fs.writeFileSync(ignorePath, ignore, 'utf8');
  console.log('✅ Created .dockerignore');
}

/**
 * Main function
 */
function main() {
  console.log('🐳 Docker Setup Script');
  console.log('======================\n');
  console.log('Creating Docker configuration files...\n');

  try {
    createDockerfile();
    createDockerCompose();
    createDockerIgnore();

    console.log('\n✅ Docker setup complete!');
    console.log('\nNext steps:');
    console.log('  1. Build the Docker image: docker-compose build');
    console.log('  2. Run the container: docker-compose up');
    console.log('  3. Run in detached mode: docker-compose up -d');
  } catch (error) {
    console.error('❌ Error creating Docker files:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  createDockerfile,
  createDockerCompose,
  createDockerIgnore
};