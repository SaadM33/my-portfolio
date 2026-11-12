#!/bin/bash
set -eu

# Create socket directory
mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld

echo "Starting MariaDB setup..."

if [ -d "/var/lib/mysql/$MARIADB_DATABASE" ]; then
	echo "Database already exists, skipping initialization"
else
	echo "Initializing MariaDB database..."
	mariadb-install-db --user=mysql --datadir=/var/lib/mysql

	echo "Starting MariaDB temporarily..."
	mariadbd --user=mysql --datadir=/var/lib/mysql --skip-networking --socket=/tmp/mysql.sock &
	pid="$!"

	# Wait until MariaDB is ready
	while ! mariadb-admin --socket=/tmp/mysql.sock ping --silent 2>/dev/null; do
		sleep 1
	done

	echo "MariaDB is ready. Setting up users and databases..."
	mariadb --socket=/tmp/mysql.sock -u root <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MARIADB_ROOT_PASSWORD}';
CREATE DATABASE IF NOT EXISTS \`${MARIADB_DATABASE}\`;
CREATE USER IF NOT EXISTS '${MARIADB_USER}'@'%' IDENTIFIED BY '${MARIADB_USER_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MARIADB_DATABASE}\`.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

	echo "Shutting down setup MariaDB..."
	mariadb-admin --socket=/tmp/mysql.sock -u root -p"${MARIADB_ROOT_PASSWORD}" shutdown
	wait "$pid"
fi

echo "Starting MariaDB normally..."
exec mariadbd --user=mysql --datadir=/var/lib/mysql