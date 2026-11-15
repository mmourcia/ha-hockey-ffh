FROM node:22-alpine
WORKDIR /app
COPY app/ /app/
RUN apk add --no-cache jq tailscale
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
