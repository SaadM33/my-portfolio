FROM debian:bookworm

RUN apt update && apt install -y \
    nginx \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/nginx/ssl

RUN openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/nginx.key \
    -out /etc/nginx/ssl/nginx.crt \
    -subj "/C=MA/ST=KH/L=Khouribga/O=1337/OU=student/CN=site.ass"

COPY conf/nginx.conf /etc/nginx/nginx.conf

COPY conf/html /var/www/html

RUN chown -R www-data:www-data /var/www/html && \
    chmod -R 755 /var/www/html

ENTRYPOINT ["nginx", "-g", "daemon off;"]
