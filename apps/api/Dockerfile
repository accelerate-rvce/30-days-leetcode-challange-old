FROM node:22-alpine
WORKDIR /srv/api
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace apps/api --include-workspace-root 2>/dev/null || npm install --omit=dev -w apps/api
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w packages/shared && npm run build -w apps/api
ENV NODE_ENV=production PORT=4000 STORE=prisma
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate -w apps/api && node apps/api/dist/index.js"]
