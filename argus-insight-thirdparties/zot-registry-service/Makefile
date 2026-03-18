include versions.env

DIST_DIR         := dist
DOCKER_REGISTRY  ?= argus-insight
ZOT_URL          := https://github.com/project-zot/zot/releases/download/v$(ZOT_VERSION)/zot-linux-$(ARCH)

.PHONY: docker docker-push docker-save docker-load clean

# ─── Docker ──────────────────────────────────────────────────────────────────

docker: zot-registry/zot
	docker build -t $(DOCKER_REGISTRY)/zot-registry:$(ZOT_VERSION) zot-registry/

zot-registry/zot:
	@echo "Downloading zot $(ZOT_VERSION)..."
	curl -Lo zot-registry/zot $(ZOT_URL)
	chmod +x zot-registry/zot

# ─── Registry Push ───────────────────────────────────────────────────────────

docker-push:
	docker push $(DOCKER_REGISTRY)/zot-registry:$(ZOT_VERSION)

# ─── Airgap Save / Load ─────────────────────────────────────────────────────

docker-save:
	@mkdir -p $(DIST_DIR)
	docker save $(DOCKER_REGISTRY)/zot-registry:$(ZOT_VERSION) | gzip > $(DIST_DIR)/zot-registry-$(ZOT_VERSION).tar.gz
	@echo "Saved: $(DIST_DIR)/zot-registry-$(ZOT_VERSION).tar.gz"

docker-load:
	docker load < $(DIST_DIR)/zot-registry-$(ZOT_VERSION).tar.gz

# ─── Clean ───────────────────────────────────────────────────────────────────

clean:
	rm -f zot-registry/zot
	rm -rf $(DIST_DIR)
