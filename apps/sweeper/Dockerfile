# The sweeper: a process that calls the Trading App's sweep route and waits (ADR-0018). No dependencies, so the
# image is the source and Node 22's type stripping runs it. Built from this directory alone, as a daemon's root is.
FROM node:22-slim
WORKDIR /app
COPY src ./src
USER node
CMD ["node", "src/main.ts"]
