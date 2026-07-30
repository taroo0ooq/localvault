.PHONY: ci-local test-go test-js lint typecheck

ci-local: lint typecheck test-js test-go

lint:
	npm run lint

typecheck:
	npm run typecheck

test-js:
	npm test

test-go:
	cd apps/vault-api && go test ./...

health:
	curl -sf http://127.0.0.1:8443/healthz
