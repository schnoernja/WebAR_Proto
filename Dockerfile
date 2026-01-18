# Nutze ein PHP-Apache Image fuer statische Dateien und API
FROM php:8.2-apache

# PostgreSQL PDO-Treiber installieren
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

# Projektdateien ins Webroot kopieren
COPY . /var/www/html

EXPOSE 80
