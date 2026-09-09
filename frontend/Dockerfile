FROM node:20-alpine

WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.js ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY .eslintrc.json ./

RUN npm install

EXPOSE 3000

CMD ["npm", "run", "dev"]
