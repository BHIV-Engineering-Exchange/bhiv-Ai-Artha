FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json .
RUN npm ci

COPY . .

RUN npm run build

# # Production stage
FROM node:18-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist ./dist

RUN adduser --disabled-password --gecos "" frontend

RUN mkdir -p /app/data/cache && \
    chown -R frontend:frontend /app

USER frontend

EXPOSE 5173

CMD ["serve", "-s", "dist", "-l", "5173"]