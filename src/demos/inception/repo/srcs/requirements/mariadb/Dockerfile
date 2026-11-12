FROM debian:bookworm

RUN apt update \
	&& apt install -y mariadb-server \
 	&& rm -rf /var/lib/apt/lists/*

# Configure MariaDB to listen on all interfaces
RUN sed -i 's/127.0.0.1/0.0.0.0/g' /etc/mysql/mariadb.conf.d/50-server.cnf

COPY tools/entrypoint.sh  /

RUN	chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]