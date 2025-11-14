FROM node:22-alpine

ARG MONGODB_URI
ENV MONGODB_URI=${MONGODB_URI}

# SAB Lanyard Backend
WORKDIR /app

COPY package*.json yarn.lock ./

RUN yarn install --frozen-lockfile --production=false

COPY . .

EXPOSE 5000
CMD ["yarn", "start"]
