FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .

ARG VITE_API_BASE_URL=http://localhost:8001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
