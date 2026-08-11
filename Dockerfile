FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Schema must exist before npm install (postinstall / prisma generate).
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

COPY src ./src
COPY tsconfig.json ./

RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Migrate, then seed demo users/data once (no-op if users already exist).
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start"]
