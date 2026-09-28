FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json README.md ./
RUN npm install --omit=dev
COPY server.js ./server.js
COPY public ./public
COPY uploads ./uploads
COPY data ./data
RUN mkdir -p /app/data /app/uploads/profiles /app/uploads/certificates /app/uploads/payments \
 && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data", "/app/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
