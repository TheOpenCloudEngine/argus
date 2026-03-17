ARG POSTGRES_VERSION=17.2
FROM postgres:${POSTGRES_VERSION}

LABEL maintainer="Argus Insight <argus@argus.local>"
LABEL description="Argus Insight Keycloak PostgreSQL - Database for Keycloak"

COPY init-keycloak-db.sh /docker-entrypoint-initdb.d/

EXPOSE 5432
