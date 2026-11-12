FROM debian:bookworm

RUN apt update && apt install -y \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

RUN sed -i 's/^bind 127.0.0.1/bind 0.0.0.0/' /etc/redis/redis.conf && \
    sed -i 's/^protected-mode yes/protected-mode no/' /etc/redis/redis.conf && \
    echo "maxmemory 256mb" >> /etc/redis/redis.conf && \
    echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf


CMD ["redis-server", "/etc/redis/redis.conf", "--daemonize", "no"]
