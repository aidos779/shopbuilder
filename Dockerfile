FROM node:20 AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 3000

# On first boot, mark the baseline migration as already applied (the DB was bootstrapped
# by `prisma db push` before migrations existed).  On subsequent boots the command is a
# no-op and the `|| true` prevents it from stopping startup.
# `prisma migrate deploy` then applies any pending migrations (expand_schema on first run,
# nothing on subsequent runs).
CMD ["sh", "-c", "(npx prisma migrate resolve --applied 20240101000000_init || true) && npx prisma migrate deploy && node src/server.js"]
