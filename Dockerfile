FROM node:lts-alpine
WORKDIR /app

COPY package*.json ./
COPY backend1/package*.json ./backend1/

RUN npm install
RUN cd backend1 && npm install

COPY backend1/ backend1/
RUN npm run build --prefix backend1

USER node
CMD [ "npm", "run", "backend1" ]

EXPOSE 8080
