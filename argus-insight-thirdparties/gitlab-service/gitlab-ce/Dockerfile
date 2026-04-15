ARG GITLAB_VERSION=17.9.1-ce.0
FROM gitlab/gitlab-ce:${GITLAB_VERSION}
LABEL maintainer="Open Cloud Engine <fharenheit@gmail.com>"

# Bake default gitlab.rb configuration into the image
# Can be overridden by bind mount or ConfigMap at runtime
COPY gitlab.rb /etc/gitlab/gitlab.rb

EXPOSE 80 443 22
VOLUME ["/etc/gitlab", "/var/log/gitlab", "/var/opt/gitlab"]
