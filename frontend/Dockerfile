FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache bash git

ARG GIT_COMMIT=unknown
ARG APP_VERSION=unknown
ARG BUILD_TIME=unknown
ENV REACT_APP_GIT_COMMIT=$GIT_COMMIT
ENV REACT_APP_VERSION=$APP_VERSION
ENV GIT_COMMIT=$GIT_COMMIT
ENV APP_VERSION=$APP_VERSION
ENV BUILD_TIME=$BUILD_TIME

COPY package*.json ./
COPY scripts/ scripts/
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
