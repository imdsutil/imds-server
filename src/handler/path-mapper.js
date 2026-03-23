// Maps raw IMDS request paths to logical request types.
//
// Handlers register against request types (e.g. "credentials"), not raw paths.
// This module translates incoming paths so the handler chain can route by type.

const PREFIX_RULES = [
  {
    prefix: "/latest/meta-data/iam/security-credentials",
    type: "credentials",
  },
];

const EXACT_RULES = new Map([
  ["/latest/meta-data/placement/region", "region"],
  ["/latest/meta-data/placement/availability-zone", "availability-zone"],
  ["/latest/meta-data/instance-id", "instance-id"],
  ["/latest/meta-data/hostname", "hostname"],
  ["/latest/meta-data/local-hostname", "hostname"],
  ["/latest/meta-data/local-ipv4", "local-ipv4"],
  ["/latest/meta-data/public-ipv4", "public-ipv4"],
  ["/latest/dynamic/instance-identity/document", "instance-identity"],
]);

export function mapPathToRequestType(path) {
  for (const rule of PREFIX_RULES) {
    if (path === rule.prefix || path.startsWith(rule.prefix + "/")) {
      return rule.type;
    }
  }

  return EXACT_RULES.get(path) ?? null;
}
