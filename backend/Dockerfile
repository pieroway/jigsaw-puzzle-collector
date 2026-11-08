FROM php:8.3-apache
RUN apt-get update && apt-get install -y --no-install-recommends libonig-dev libxml2-dev libjpeg62-turbo-dev libpng-dev libwebp-dev unzip git \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install pdo_mysql mbstring dom xml xmlwriter gd exif && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY ./infra/apache.conf /etc/apache2/sites-available/000-default.conf
COPY ./infra/uploads.ini /usr/local/etc/php/conf.d/uploads.ini
WORKDIR /var/www/html
