#!/bin/bash
set -e

echo "Waiting for MariaDB to be ready..."

# Wait for MariaDB
while ! mysqladmin ping -h"${MARIADB_HOST}" -u"${MARIADB_USER}" -p"${MARIADB_USER_PASSWORD}" --silent; do
    sleep 2
    echo "Waiting for database connection..."
done

echo "MariaDB is ready!"

cd /var/www/html

# Fix permissions for the mounted volume
chown -R www-data:www-data /var/www/html

# Download WordPress if not present
if [ ! -f wp-config.php ]; then
    echo "Downloading WordPress..."
    wp core download --allow-root
    
    echo "Creating wp-config.php..."
    wp config create \
        --dbname="${MARIADB_DATABASE}" \
        --dbuser="${MARIADB_USER}" \
        --dbpass="${MARIADB_USER_PASSWORD}" \
        --dbhost="${MARIADB_HOST}:3306" \
        --allow-root
    
    echo "Installing WordPress..."
    wp core install \
        --url="${WP_URL}" \
        --title="${WP_TITLE}" \
        --admin_user="${WP_ADMIN_USER}" \
        --admin_password="${WP_ADMIN_PASSWORD}" \
        --admin_email="${WP_ADMIN_EMAIL}" \
        --allow-root
    
    echo "Creating second user..."
    wp user create \
        "${WP_USER}" \
        "${WP_USER_EMAIL}" \
        --role=editor \
        --user_pass="${WP_USER_PASSWORD}" \
        --allow-root
    
    echo "WordPress installation complete!"
fi

# Configure Redis cache (BONUS)
if [ ! -z "${REDIS_HOST:-}" ]; then
    wp plugin install redis-cache --activate --allow-root 2>/dev/null || wp plugin activate redis-cache --allow-root 2>/dev/null
    wp config set WP_REDIS_HOST "${REDIS_HOST}" --allow-root 2>/dev/null
    wp config set WP_REDIS_PORT 6379 --raw --allow-root 2>/dev/null
    wp config set WP_CACHE true --raw --allow-root 2>/dev/null
    wp redis enable --allow-root 2>/dev/null || true
fi

chown -R www-data:www-data /var/www/html

# Start PHP-FPM (in foreground)
echo "Starting PHP-FPM..."
exec php-fpm8.2 -F