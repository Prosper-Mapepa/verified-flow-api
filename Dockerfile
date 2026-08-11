FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Persist SQLite at /data on a Railway volume (mount /data).
CMD ["sh", "-c", "mkdir -p /data && npx prisma migrate deploy && npm start"]
