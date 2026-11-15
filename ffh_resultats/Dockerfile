FROM node:22-alpine
ARG BUILD_VERSION
ENV APP_VERSION=$BUILD_VERSION
WORKDIR /app
COPY app/ /app/
RUN apk add --no-cache jq tailscale
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
