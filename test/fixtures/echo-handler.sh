#!/usr/bin/env bash
# Example handler that returns fake AWS credentials for any request.
# Usage: configure in ~/.imds-server.yaml under handlers.

echo "{
  \"Code\": \"Success\",
  \"LastUpdated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"Type\": \"AWS-HMAC\",
  \"AccessKeyId\": \"AKIAIOSFODNN7EXAMPLE\",
  \"SecretAccessKey\": \"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\",
  \"Token\": \"FwoGZXIvYXdzEBYaDHqa0AP1LVMo5EXAMPLE\",
  \"Expiration\": \"2099-01-01T00:00:00Z\"
}"
