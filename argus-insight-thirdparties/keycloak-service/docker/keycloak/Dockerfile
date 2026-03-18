ARG KEYCLOAK_VERSION=26.1.0
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}

LABEL maintainer="Argus Insight <argus@argus.local>"
LABEL description="Argus Insight Keycloak - Identity and Access Management"

# Custom themes or providers can be added here
# COPY themes/ /opt/keycloak/themes/
# COPY providers/ /opt/keycloak/providers/

EXPOSE 8080 9000
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
