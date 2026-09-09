FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./
COPY tsconfig.json ./
COPY jest.config.js ./
COPY .eslintrc.cjs ./
# Schema is copied so `npm install` can run `prisma generate` at build time.
# The ./backend/prisma volume mount overlays this at runtime for migration workflow.
COPY prisma ./prisma

RUN npm install

EXPOSE 4000

CMD ["npm", "run", "dev"]
