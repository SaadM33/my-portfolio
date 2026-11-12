FROM debian:bookworm

RUN apt update && apt install -y \
    php8.2-fpm \
    php8.2-mysqli \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN sed -i 's|^listen = .*|listen = 0.0.0.0:9000|' /etc/php/*/fpm/pool.d/www.conf

RUN mkdir -p /var/www/html/adminer && \
    curl -L -o /var/www/html/adminer/index.php "https://www.adminer.org/latest.php" && \
    chown -R www-data:www-data /var/www/html

CMD ["php-fpm8.2", "-F"]
