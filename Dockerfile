# syntax=docker/dockerfile:1

# 공통 의존성 (devDependencies 포함)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 로컬 개발: 소스는 compose가 볼륨으로 마운트한다.
FROM deps AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# TypeScript 컴파일
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Cloud Run 배포용 (기본 타깃)
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
