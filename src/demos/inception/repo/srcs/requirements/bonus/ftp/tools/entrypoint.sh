#!/bin/bash
set -e

echo "Setting up FTP server..."

if ! id -u "${FTP_USER}" >/dev/null 2>&1; then
    echo "Creating FTP user: ${FTP_USER}"
    useradd -m -d /var/www/html "${FTP_USER}"
    echo "${FTP_USER}:${FTP_PASSWORD}" | chpasswd
    
    echo "${FTP_USER}" > /etc/vsftpd.userlist
fi

chown -R "${FTP_USER}:${FTP_USER}" /var/www/html

echo "Starting vsftpd..."
exec /usr/sbin/vsftpd /etc/vsftpd.conf
