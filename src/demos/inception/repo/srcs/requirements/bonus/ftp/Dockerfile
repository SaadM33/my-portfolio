FROM debian:bookworm

RUN apt update && apt install -y \
    vsftpd \
    && rm -rf /var/lib/apt/lists/*

COPY conf/vsftpd.conf /etc/vsftpd.conf

COPY tools/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /var/www/html /var/run/vsftpd/empty


ENTRYPOINT ["/entrypoint.sh"]
