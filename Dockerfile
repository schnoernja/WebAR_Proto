# Nutze ein PHP-Apache Image fuer statische Dateien und API
FROM php:8.2-apache

# PostgreSQL PDO-Treiber installieren
RUN docker-php-ext-install pdo pdo_pgsql

# Projektdateien ins Webroot kopieren
COPY . /var/www/html

EXPOSE 80
