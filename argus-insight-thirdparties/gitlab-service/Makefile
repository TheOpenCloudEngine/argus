include versions.env

DOCKER_REGISTRY ?= argus-insight

.PHONY: all clean docker docker-gitlab-ce docker-gitlab-runner docker-push \
        docker-push-gitlab-ce docker-push-gitlab-runner docker-save docker-load

all: docker

# ─── Docker Build ─────────────────────────────────────────────────────────────

docker: docker-gitlab-ce docker-gitlab-runner

docker-gitlab-ce:
	docker build -t $(DOCKER_REGISTRY)/gitlab-ce:$(GITLAB_VERSION) \
		--build-arg GITLAB_VERSION=$(GITLAB_VERSION) \
		gitlab-ce/

docker-gitlab-runner:
	docker build -t $(DOCKER_REGISTRY)/gitlab-runner:$(GITLAB_RUNNER_VERSION) \
		--build-arg GITLAB_RUNNER_VERSION=$(GITLAB_RUNNER_VERSION) \
		gitlab-runner/

# ─── Docker Push (to private registry) ───────────────────────────────────────

docker-push: docker-push-gitlab-ce docker-push-gitlab-runner

docker-push-gitlab-ce:
	docker push $(DOCKER_REGISTRY)/gitlab-ce:$(GITLAB_VERSION)

docker-push-gitlab-runner:
	docker push $(DOCKER_REGISTRY)/gitlab-runner:$(GITLAB_RUNNER_VERSION)

# ─── Docker Save/Load (for airgap transfer) ──────────────────────────────────

DIST_DIR := dist

docker-save:
	@mkdir -p $(DIST_DIR)
	docker save $(DOCKER_REGISTRY)/gitlab-ce:$(GITLAB_VERSION) \
		| gzip > $(DIST_DIR)/gitlab-ce-$(GITLAB_VERSION).tar.gz
	docker save $(DOCKER_REGISTRY)/gitlab-runner:$(GITLAB_RUNNER_VERSION) \
		| gzip > $(DIST_DIR)/gitlab-runner-$(GITLAB_RUNNER_VERSION).tar.gz
	@echo ""
	@echo "Saved images:"
	@ls -lh $(DIST_DIR)/gitlab-*.tar.gz

docker-load:
	gunzip -c $(DIST_DIR)/gitlab-ce-$(GITLAB_VERSION).tar.gz | docker load
	gunzip -c $(DIST_DIR)/gitlab-runner-$(GITLAB_RUNNER_VERSION).tar.gz | docker load

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf $(DIST_DIR)
