FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/packages/core/package.json ./frontend/packages/core/package.json
COPY frontend/packages/game-engine/package.json ./frontend/packages/game-engine/package.json

# The root postinstall patches native mobile dependencies, which are intentionally
# absent from this backend-only image.
RUN npm ci --ignore-scripts --workspace @rps/backend --workspace @rps/core --workspace @rps/game-engine

COPY backend ./backend
COPY frontend/packages/core ./frontend/packages/core
COPY frontend/packages/game-engine ./frontend/packages/game-engine
# Publication verifies immutable metadata against the approved preview bytes.
# PNGs only, no Rive/native/web build output in the backend image.
COPY frontend/apps/web/public/figures/*.png ./frontend/apps/web/public/figures/

ENV NODE_ENV=production
EXPOSE 8080

USER node

CMD ["npm", "run", "start:server"]
