FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_STATS_API_URL=http://localhost:8002
ENV NEXT_PUBLIC_STATS_API_URL=$NEXT_PUBLIC_STATS_API_URL

RUN pnpm build

EXPOSE 3001

CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3001"]
