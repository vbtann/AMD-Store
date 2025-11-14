FROM node:22-alpine

# SAB Lanyard Backend
WORKDIR /app

COPY package*.json yarn.lock ./

RUN yarn install --frozen-lockfile --production=false

COPY . .

EXPOSE 5000
CMD ["yarn", "start"]
