FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/packages/core/package.json ./frontend/packages/core/package.json

# The root postinstall patches native mobile dependencies, which are intentionally
# absent from this backend-only image.
RUN npm ci --ignore-scripts --workspace @rps/backend --workspace @rps/core

COPY backend ./backend
COPY frontend/packages/core ./frontend/packages/core

ENV NODE_ENV=production
EXPOSE 8080

USER node

CMD ["npm", "run", "start:server"]
