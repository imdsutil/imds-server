# Contributing to IMDS Server

Thank you for your interest in contributing to IMDS Server! This guide will help you get started.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

- Check the [existing issues](https://github.com/imdsutil/imds-server/issues) to avoid duplicates
- Use the **Bug Report** issue template
- Include steps to reproduce, expected behavior, and actual behavior
- Include your Node.js version and operating system

### Suggesting Features

- Use the **Feature Request** issue template
- Describe the use case and expected behavior
- Explain why this would be useful to other users

### Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Make your changes
5. Ensure tests pass:
   ```bash
   pnpm test
   ```
6. Ensure linting passes:
   ```bash
   pnpm lint
   ```
7. Commit your changes using [Conventional Commits](#commit-messages)
8. Push your branch and open a pull request

### Commit Messages

This project enforces [Conventional Commits](https://www.conventionalcommits.org/). All commit messages must follow this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Changes to build system or dependencies
- `ci`: Changes to CI configuration
- `chore`: Other changes that don't modify src or test files

**Examples:**

```
feat: add IMDSv2 token endpoint
fix: handle timeout on metadata request
docs: update configuration examples
```

### Pull Requests

- Fill out the pull request template completely
- Link related issues using `Closes #123` or `Fixes #123`
- Keep changes focused; one feature or fix per PR
- Add tests for new functionality
- Update documentation if needed

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/)

### Getting Started

```bash
# Clone your fork
git clone https://github.com/<your-username>/imds-server.git
cd imds-server

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format
```

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
