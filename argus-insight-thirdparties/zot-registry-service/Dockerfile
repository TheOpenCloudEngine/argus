FROM rockylinux:9-minimal

RUN microdnf install -y jq && microdnf clean all

RUN curl -Lo /usr/local/bin/zot \
        https://github.com/project-zot/zot/releases/latest/download/zot-linux-amd64 && \
    chmod +x /usr/local/bin/zot

RUN mkdir -p /etc/zot /var/lib/zot

EXPOSE 5000

CMD ["/usr/local/bin/zot", "serve", "/etc/zot/config.json"]
