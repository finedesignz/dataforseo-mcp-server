FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist/ ./dist/
# Default to HTTP mode on port 3580; override via PORT env var.
ENV PORT=3580
EXPOSE 3580
ENTRYPOINT ["node", "dist/index.js"]
