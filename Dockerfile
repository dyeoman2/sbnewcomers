FROM --platform=linux/x86_64 node:20-alpine

WORKDIR /app

COPY package.json .

RUN npm install

COPY . ./

EXPOSE 3000

CMD ["npm", "start"]
