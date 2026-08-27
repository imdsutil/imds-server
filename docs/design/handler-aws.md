# handler-aws design

Separate npm package (`@imdsutil/imds-handler-aws`) that ships as an executable
handler command for imds-server. Handles AWS credential resolution for
opted-in containers running on a developer's local machine.

## Scope

imds-server is a desktop tool. This handler targets local dev workflows only.
It is not intended for deployment into cloud environments.

## How it fits in

Users install the package, then reference the bin in `~/.imds-server.yml`:

```yaml
handlers:
  - command: imds-handler-aws
    types:
      - credentials
```

The server spawns the handler per request with container context as CLI args.
The handler resolves credentials and writes IMDS-format JSON to stdout.

## Credential scenarios

### Group 1: Static credentials

Simplest path. Useful for solo devs with a single set of IAM user credentials.

**1a. Global static credentials**
All opted-in containers get the same key/secret. Configured in the handler's
own config (or env vars). No per-container labels needed beyond
`imds.aws.ambient: "true"` or another AWS opt-in label.

**1b. Per-container static credentials**
Different key/secret per container via labels:

- `imds.aws.access-key-id`
- `imds.aws.secret-access-key`
- `imds.aws.session-token` (optional, for pre-assumed role creds)

Frowned upon for services but common in dev. We support it without judgment.

### Group 2: Named AWS profile

Reads from `~/.aws/credentials` and `~/.aws/config`. Profile name comes from
the `imds.aws.profile` container label, or falls back to a configured default.

**2a. Static credentials profile**
Profile has `aws_access_key_id` and `aws_secret_access_key`. Handler resolves
and returns directly.

**2b. Role profile**
Profile has `role_arn` and `source_profile`. SDK handles the assume-role
automatically. Handler just resolves the profile.

**2c. SSO profile**
Profile backed by IAM Identity Center (AWS SSO). The dominant corporate
pattern. Session expires regularly and requires re-authentication.

When `autoSsoLogin: true` is set in handler config (default: false), the
handler detects the SSO expiry error, spawns `aws sso login --profile <name>`,
and blocks until the user approves in the browser. The browser tab opens
automatically via the system (`open` on macOS, `xdg-open` on Linux). After
approval the handler retries credential resolution and returns creds.

When `autoSsoLogin: false`, handler exits 2 with a clear message telling the
user to run `aws sso login --profile <name>` manually.

**Caveats for autoSsoLogin:**

- Handlers using this feature need a high timeout in `~/.imds-server.yml`
  (e.g. `timeout: 120000`). The default 5s ceiling is not enough for a human
  to approve a browser flow.
- If imds-server runs as root (e.g. `sudo` to bind port 80), the handler
  inherits the root context. On Linux, `sudo` strips desktop session env vars
  (`DISPLAY`, `DBUS_SESSION_BUS_ADDRESS`) so `xdg-open` may not find the
  browser. macOS is unaffected. Workaround: run imds-server on a
  non-privileged port or via a unix socket to avoid needing sudo.

**2d. credential_process profile**
Profile delegates to an external command via `credential_process`. Covers:

- aws-vault
- Leapp
- 1Password CLI (`op run`)
- Any custom secret fetcher

SDK handles this automatically via the credential provider chain — effectively
free once profile resolution is wired up.

### Group 3: Role assumption

`imds.aws.role` label contains the role ARN to assume. The caller identity is
resolved from the credential chain (profile, ambient env, etc.).

**3a. AssumeRole with ambient caller**
Caller resolved from default credential chain (env vars → default profile →
credential_process). Most common use case for developers who have a working
AWS CLI setup and just want to assume a project role.

**3b. AssumeRole with named profile as caller**
`imds.aws.profile` selects the caller identity, `imds.aws.role` is the role to
assume. Useful for multi-account setups where the user has a base identity
in one account and assumes roles in others.

**3c. AssumeRole with static caller credentials**
Labels provide both the caller creds and the role ARN. Niche but supported
as a combination of group 1b + group 3.

**3d. Multi-hop role chaining**
Assume role A, use those creds to assume role B. Corporate landing zones with
org account structures (dev/staging/prod accounts) require this regularly.
AWS allows up to 5 hops. Supported by configuring a chain of role ARNs, or
by relying on a profile that already has chaining configured.

**3e. AssumeRole with External ID**
Some roles have a trust policy requiring an `ExternalId` condition. Common in
cross-account setups and third-party access patterns. Configurable per handler
or per container label (`imds.aws.external-id`).

**3f. AssumeRole with MFA**
Some roles require MFA serial + token. TOTP can be automated if the user
provides a TOTP secret. At minimum, handler should detect the MFA required
error and exit 2 with a clear message. Auto-TOTP is a stretch goal.

### Group 4: Ambient passthrough

No role assumption. Handler resolves whatever the default credential chain
returns and passes it through as IMDS credentials. Useful for developers whose
host machine already has the right identity (SSO session, env vars, etc.) and
they just want containers to inherit it.

Opt-in via `imds.aws.ambient: "true"` label.

## Container opt-in

Containers must opt in. The handler exits 1 (pass) if no AWS label is present,
letting the next handler try.

Opt-in signals (evaluated in order):

1. `imds.aws.role` — present → group 3 (role assumption)
2. `imds.aws.profile` — present → group 2 (profile resolution)
3. `imds.aws.access-key-id` — present → group 1b (per-container static creds)
4. `imds.aws.ambient: "true"` + global static creds in handler config → group 1a
5. `imds.aws.ambient: "true"` alone → group 4 (ambient passthrough)
6. None of the above → exit 1

## Role ARN source

For group 3, the role ARN can come from:

- `imds.aws.role` container label (primary)
- Handler config as a global default role (fallback)

## STS options

Configurable at the handler level, overridable per container via labels where
it makes sense:

| Option                | Label                       | Config key        | Default                        |
| --------------------- | --------------------------- | ----------------- | ------------------------------ |
| Session name          | —                           | `sessionName`     | `imds-server-{container-name}` |
| Session duration      | `imds.aws.session-duration` | `sessionDuration` | `3600`                         |
| External ID           | `imds.aws.external-id`      | `externalId`      | —                              |
| Role ARN              | `imds.aws.role`             | `defaultRole`     | —                              |
| STS regional endpoint | —                           | `stsRegion`       | `us-east-1`                    |
| Custom STS endpoint   | —                           | `stsEndpoint`     | —                              |

## Credential caching

The handler is spawned per request. Without caching, multiple containers
requesting credentials simultaneously will each make an STS AssumeRole call.
STS has rate limits, and round-trip latency adds up.

Handler should cache resolved credentials (keyed on role ARN + profile + caller
identity) and return cached creds until 5 minutes before expiry. Cache lives in
a temp file (e.g. `~/.cache/imds-handler-aws/`) so it survives across
invocations without an in-process cache.

## Handler config file

Handler reads its own config from `~/.imds-handler-aws.yml` (auto-loaded) or
`--config` override. Keys live under a flat namespace:

```yaml
# Default profile to use when imds.aws.profile label is not set
# defaultProfile: default

# Global static credentials (all opted-in containers)
# accessKeyId: AKIA...
# secretAccessKey: ...

# Global default role ARN (used when imds.aws.role label is not set but container
# has opted in via another signal)
# defaultRole: arn:aws:iam::123456789012:role/dev

# Session name template. {container-name} is replaced at runtime.
# sessionName: "imds-server-{container-name}"

# Automatically run `aws sso login` when an SSO session is expired.
# Requires a high timeout on the handler entry in ~/.imds-server.yml (e.g. 120000ms).
# Not recommended if imds-server runs as root on Linux (browser may not open).
# autoSsoLogin: false

# Session duration in seconds (900-43200)
# sessionDuration: 3600

# STS region (determines which regional endpoint is used)
# stsRegion: us-east-1

# Custom STS endpoint (for GovCloud, China, or corporate proxy)
# stsEndpoint: https://sts.us-gov-west-1.amazonaws.com
```

## Package structure

```
handler-aws/
  bin/
    imds-handler-aws.js   # entry point, thin CLI wrapper
  src/
    config.js             # config loader
    resolve.js            # credential resolution decision tree
    sts.js                # STS AssumeRole wrapper
    cache.js              # credential cache (temp file)
    format.js             # format resolved creds as IMDS JSON
  test/
    ...
  package.json
```

## Error handling

| Condition                | Exit code | stderr                                       |
| ------------------------ | --------- | -------------------------------------------- |
| No opt-in signal         | 1         | —                                            |
| SSO session expired      | 2         | Clear message + `aws sso login` command      |
| MFA required             | 2         | Clear message with serial and instructions   |
| STS access denied        | 2         | AWS error message                            |
| Config file not found    | —         | Optional; all settings fall back to defaults |
| Invalid config           | 2         | Specific validation error                    |
| Credential cache corrupt | —         | Silently discard, re-resolve                 |

## Dependencies

- `@aws-sdk/client-sts` — AssumeRole
- `@aws-sdk/credential-providers` — profile, SSO, credential_process, ambient chain
- `yaml` — config file parsing
