FROM node:20 AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3000

# prisma db push creates the schema on a fresh DB without requiring migration files.
# Switch to `prisma migrate deploy` once you've generated migrations with `prisma migrate dev`.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/server.js"]
