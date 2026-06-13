FROM node:20-alpine

# sharp 需要的原生依賴
RUN apk add --no-cache \
    vips-dev \
    fftw-dev \
    build-base \
    python3

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/index.js"]
