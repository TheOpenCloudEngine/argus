FROM rockylinux:9-minimal
LABEL maintainer="Open Cloud Engine <fharenheit@gmail.com>"

RUN microdnf install -y jq && microdnf clean all

COPY zot /usr/local/bin/zot
RUN chmod +x /usr/local/bin/zot

RUN mkdir -p /etc/zot /var/lib/zot

EXPOSE 5000

VOLUME ["/var/lib/zot"]

CMD ["/usr/local/bin/zot", "serve", "/etc/zot/config.json"]
