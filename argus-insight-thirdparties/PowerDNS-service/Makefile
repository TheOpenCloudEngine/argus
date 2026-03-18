include versions.env

DOCKER_REGISTRY ?= argus-insight

.PHONY: all clean docker docker-mariadb docker-powerdns-server docker-powerdns-admin \
        docker-push docker-push-mariadb docker-push-powerdns-server docker-push-powerdns-admin \
        docker-save docker-load

all: docker

# ─── Docker Build ─────────────────────────────────────────────────────────────

docker: docker-mariadb docker-powerdns-server docker-powerdns-admin

docker-mariadb:
	docker build -t $(DOCKER_REGISTRY)/powerdns-mariadb:$(MARIADB_VERSION) \
		--build-arg MARIADB_VERSION=$(MARIADB_VERSION) \
		mariadb/

docker-powerdns-server:
	docker build -t $(DOCKER_REGISTRY)/powerdns-server:$(PDNS_VERSION) \
		--build-arg PDNS_VERSION=$(PDNS_VERSION) \
		powerdns-server/

docker-powerdns-admin:
	docker build -t $(DOCKER_REGISTRY)/powerdns-admin:$(PDNS_ADMIN_VERSION) \
		--build-arg PDNS_ADMIN_VERSION=$(PDNS_ADMIN_VERSION) \
		powerdns-admin/

# ─── Docker Push (to private registry) ───────────────────────────────────────

docker-push: docker-push-mariadb docker-push-powerdns-server docker-push-powerdns-admin

docker-push-mariadb:
	docker push $(DOCKER_REGISTRY)/powerdns-mariadb:$(MARIADB_VERSION)

docker-push-powerdns-server:
	docker push $(DOCKER_REGISTRY)/powerdns-server:$(PDNS_VERSION)

docker-push-powerdns-admin:
	docker push $(DOCKER_REGISTRY)/powerdns-admin:$(PDNS_ADMIN_VERSION)

# ─── Docker Save/Load (for airgap transfer) ──────────────────────────────────

DIST_DIR := dist

docker-save:
	@mkdir -p $(DIST_DIR)
	docker save $(DOCKER_REGISTRY)/powerdns-mariadb:$(MARIADB_VERSION) \
		| gzip > $(DIST_DIR)/powerdns-mariadb-$(MARIADB_VERSION).tar.gz
	docker save $(DOCKER_REGISTRY)/powerdns-server:$(PDNS_VERSION) \
		| gzip > $(DIST_DIR)/powerdns-server-$(PDNS_VERSION).tar.gz
	docker save $(DOCKER_REGISTRY)/powerdns-admin:$(PDNS_ADMIN_VERSION) \
		| gzip > $(DIST_DIR)/powerdns-admin-$(PDNS_ADMIN_VERSION).tar.gz
	@echo ""
	@echo "Saved images:"
	@ls -lh $(DIST_DIR)/powerdns-*.tar.gz

docker-load:
	gunzip -c $(DIST_DIR)/powerdns-mariadb-$(MARIADB_VERSION).tar.gz | docker load
	gunzip -c $(DIST_DIR)/powerdns-server-$(PDNS_VERSION).tar.gz | docker load
	gunzip -c $(DIST_DIR)/powerdns-admin-$(PDNS_ADMIN_VERSION).tar.gz | docker load

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf $(DIST_DIR)
