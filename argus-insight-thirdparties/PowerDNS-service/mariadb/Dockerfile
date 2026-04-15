ARG MARIADB_VERSION=11.7
FROM mariadb:${MARIADB_VERSION}
LABEL maintainer="Open Cloud Engine <fharenheit@gmail.com>"

# Bake PowerDNS schema into the image for airgap environments
COPY mysql-init/ /docker-entrypoint-initdb.d/
COPY my.cnf /etc/my.cnf

EXPOSE 3306
VOLUME ["/var/lib/mysql"]
