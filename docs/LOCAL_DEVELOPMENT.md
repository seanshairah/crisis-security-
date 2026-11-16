# Local development

Use [the root README](../README.md) for a fresh checkout and [Admin quick start](ADMIN_QUICK_START.md) for this existing local installation.

Do not overwrite the private .env.local, reinitialize the connected database, or uninstall the Android app to update it. Use a separate disposable database on loopback port 55439 for integration tests and the isolated server on port 3141 for HTTP tests.

Production Android requires an HTTPS backend and the retained release signing key. See [Security operations](SECURITY_OPERATIONS.md). Historical development instructions are [archived](archive/LOCAL_DEVELOPMENT.md).
