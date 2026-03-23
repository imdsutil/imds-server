# IMDS Server

A customizable Instance Metadata Service (IMDS) server for local development and testing.

IMDS Server lets you run a local metadata service that mimics cloud provider IMDS endpoints (e.g., AWS EC2 instance metadata at `169.254.169.254`). This enables local development and testing of applications that depend on IMDS without deploying to a cloud environment.

## Features

- Customizable metadata responses
- Support for IMDSv1 and IMDSv2 (token-based) request patterns
- Runs as a standalone server or Docker container
- Lightweight with zero production dependencies

## Installation

### npm

```bash
npm install -g @imdsutil/imds-server
```

### Docker

```bash
docker pull imdsutil/imds-server:latest
```

## Quick Start

```bash
# Run directly
imds-server

# Run with Docker
docker run -p 169.254.169.254:80:80 imdsutil/imds-server:latest
```

## Documentation

See the [docs](docs/) directory for detailed usage and configuration guides.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

## Security

To report a security vulnerability, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the [Apache License 2.0](LICENSE).
