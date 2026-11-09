# Airwatch agent guide

- Start with [README.md](README.md) for user-facing setup and provider status.
- For code ownership, data/selection contracts and offline checks, read
  [docs/development.md](docs/development.md).
- For frontend assets or backend delivery, read [docs/deployment.md](docs/deployment.md)
  before planning any live operation.
- Keep changes bounded; inspect Git state and preserve existing edits. Keep credentials,
  private Home Assistant storage and personal installation details out of commits.
- Repository changes and PR publication do not authorize merge, deployment, Home Assistant
  restart/reload, or physical device actions. Obtain explicit approval for those operations.
- Report offline checks, live acceptance and physical evidence separately; a successful
  build does not establish that Home Assistant serves or runs the change.
