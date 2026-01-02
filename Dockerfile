FROM node:18-bookworm

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install dependencies (forcing build from source to ensure glibc compatibility)
RUN npm install --production --build-from-source

COPY server.js ./

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
