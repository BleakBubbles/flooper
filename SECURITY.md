# Security policy

The Flooper widget runs on other people's websites, so security reports are
taken seriously and are always welcome.

## Reporting a vulnerability

Please **don't** open a public issue. Instead, use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository ("Security" tab → "Report a vulnerability").

Include what you found, how to reproduce it, and the impact you think it has.
You can expect an acknowledgement within a week. This is a one-person project,
so please allow reasonable time for a fix before disclosing publicly.

## Scope

The most interesting areas are the SDK (anything that could affect a host
page), the public ingest endpoint, and authentication and authorization in the
portal API.
