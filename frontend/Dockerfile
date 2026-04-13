FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache bash git

ARG GIT_COMMIT=unknown
ENV REACT_APP_GIT_COMMIT=$GIT_COMMIT

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
