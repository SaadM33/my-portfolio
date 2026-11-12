FROM debian:bookworm

RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    libc6 \
    && rm -rf /var/lib/apt/lists/*

RUN wget -O /usr/local/bin/cadvisor https://github.com/google/cadvisor/releases/download/v0.49.1/cadvisor-v0.49.1-linux-amd64 && \
    chmod +x /usr/local/bin/cadvisor

EXPOSE 8080

CMD ["/usr/local/bin/cadvisor", "-logtostderr"]
