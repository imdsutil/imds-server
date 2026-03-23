import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPathToRequestType } from "../../../src/handler/path-mapper.js";

// Credentials

test("mapPathToRequestType: security-credentials with role name returns credentials", () => {
  assert.equal(
    mapPathToRequestType("/latest/meta-data/iam/security-credentials/my-role"),
    "credentials",
  );
});

test("mapPathToRequestType: security-credentials trailing slash returns credentials", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/iam/security-credentials/"), "credentials");
});

test("mapPathToRequestType: security-credentials without trailing slash returns credentials", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/iam/security-credentials"), "credentials");
});

// Placement

test("mapPathToRequestType: placement/region returns region", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/placement/region"), "region");
});

test("mapPathToRequestType: placement/availability-zone returns availability-zone", () => {
  assert.equal(
    mapPathToRequestType("/latest/meta-data/placement/availability-zone"),
    "availability-zone",
  );
});

// Simple metadata paths

test("mapPathToRequestType: instance-id returns instance-id", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/instance-id"), "instance-id");
});

test("mapPathToRequestType: hostname returns hostname", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/hostname"), "hostname");
});

test("mapPathToRequestType: local-hostname returns hostname", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/local-hostname"), "hostname");
});

test("mapPathToRequestType: local-ipv4 returns local-ipv4", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/local-ipv4"), "local-ipv4");
});

test("mapPathToRequestType: public-ipv4 returns public-ipv4", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/public-ipv4"), "public-ipv4");
});

// Dynamic paths

test("mapPathToRequestType: instance-identity/document returns instance-identity", () => {
  assert.equal(
    mapPathToRequestType("/latest/dynamic/instance-identity/document"),
    "instance-identity",
  );
});

// Unknown paths

test("mapPathToRequestType: unknown path returns null", () => {
  assert.equal(mapPathToRequestType("/latest/meta-data/something-new"), null);
});

test("mapPathToRequestType: completely unrelated path returns null", () => {
  assert.equal(mapPathToRequestType("/foo/bar"), null);
});

test("mapPathToRequestType: empty string returns null", () => {
  assert.equal(mapPathToRequestType(""), null);
});

// Edge cases

test("mapPathToRequestType: security-credentials with deep path returns credentials", () => {
  assert.equal(
    mapPathToRequestType("/latest/meta-data/iam/security-credentials/my-role/extra"),
    "credentials",
  );
});

test("mapPathToRequestType: path without /latest prefix returns null", () => {
  assert.equal(mapPathToRequestType("/meta-data/instance-id"), null);
});
