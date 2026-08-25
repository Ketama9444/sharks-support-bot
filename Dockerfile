FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data/support /app/data/spy6
ENV NODE_ENV=production
ENV DATA_ROOT=/app/data
CMD ["npm", "start"]
